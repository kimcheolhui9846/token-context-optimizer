"""R03 error audit: rebuild the experiment-3 population, sample and blind payload offline from a pinned commit."""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

BASE = 'f04d4b69083c0d1446a8b3ac760f185a1204cea9'
ROOT = Path(__file__).resolve().parents[3]
PREFIX = 'research/results/s3-heldout'
PROVIDERS = ('gpt4o', 'haiku')
CONDITIONS = ('S0', 'S1', 'S2', 'S3', 'S4')
TEMPLATES = ('document-review', 'report-check', 'ui-debugging')
SUMMARY_CONDITIONS = ('S1', 'S3')
SUMMARY_TURNS = (3, 6)
TURNS, SESSIONS = 8, 24
RESULT_RE = re.compile(r'\.(S[0-4])\.json$')


class AuditError(RuntimeError):
    pass


def git_ls_tree():
    try:
        p = subprocess.run(['git', '-C', str(ROOT), 'ls-tree', '-r', '--name-only', '-z', BASE, '--', PREFIX],
                           capture_output=True)
    except OSError as e:
        raise AuditError(f'git 실행 실패: {e}')
    if p.returncode:
        raise AuditError(f'git ls-tree 실패: {p.stderr.decode("utf8", "replace").strip()}')
    paths = [x for x in p.stdout.decode('utf8').split('\0') if x]
    if not paths or len(set(paths)) != len(paths):
        raise AuditError('ls-tree 결과가 비었거나 경로가 중복됨')
    return paths


def read_blobs(paths):
    """Read BASE:path raw bytes through one `git cat-file --batch` process; decode strictly as UTF-8."""
    try:
        proc = subprocess.Popen(['git', '-C', str(ROOT), 'cat-file', '--batch'],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    except OSError as e:
        raise AuditError(f'git 실행 실패: {e}')
    out = {}
    try:
        for p in paths:
            proc.stdin.write(f'{BASE}:{p}\n'.encode('utf8'))
            proc.stdin.flush()
            head = proc.stdout.readline().split()
            if len(head) != 3 or head[1] != b'blob' or not head[2].isdigit():
                raise AuditError(f'git cat-file 오류: {p}: {head!r}')
            size = int(head[2])
            body = proc.stdout.read(size)
            if len(body) != size or proc.stdout.read(1) != b'\n':
                raise AuditError(f'blob 읽기 손상: {p}')
            try:
                out[p] = body.decode('utf8')
            except UnicodeDecodeError as e:
                raise AuditError(f'UTF-8 손상: {p}: {e}')
    finally:
        proc.stdin.close()
        proc.stdout.close()
        proc.wait()
    return out


def _no_dup(pairs):
    d = {}
    for k, v in pairs:
        if k in d:
            raise ValueError(f'중복 키 {k!r}')
        d[k] = v
    return d


def loads(text, where):
    try:
        return json.loads(text, object_pairs_hook=_no_dup)
    except ValueError as e:
        raise AuditError(f'손상된 JSON: {where}: {e}')


def need(obj, keys, where):
    if not isinstance(obj, dict) or any(k not in obj for k in keys):
        raise AuditError(f'필수 키 누락 또는 형식 오류: {where} {keys}')
    return obj


def provider_of(path):
    found = {x for x in path.split('/') if x in PROVIDERS}
    if len(found) > 1:
        raise AuditError(f'provider 모호: {path}')
    return next(iter(found), None)


def make_entry(prov, cond, tpl, sess, turn, kind, path, stop, blind):
    canon = '|'.join(('R03-v1', prov, cond, tpl, sess, str(turn), kind))
    full = hashlib.sha256(canon.encode('utf8')).hexdigest()
    rid = full[:16]
    blind = {'id': rid, 'kind': kind, **blind}
    rec = {'id': rid, 'kind': kind, 'provider': prov, 'condition': cond, 'template': tpl, 'session': sess,
           'turn': turn, 'path': path, 'stop': stop, 'blind': blind}
    return {'rec': rec, 'full': full, 'canon': canon}


def load_population():
    paths = git_ls_tree()
    results, call_files = [], []
    for p in paths:
        prov = provider_of(p)
        if prov is None:
            continue
        m = RESULT_RE.search(p)
        if m:
            results.append((prov, m.group(1), p))
        elif p.rsplit('/', 1)[-1] == 'calls.jsonl':
            call_files.append((prov, p))
    blobs = read_blobs([p for _, _, p in results] + [p for _, p in call_files])
    calls = {}
    for prov, p in call_files:
        for n, line in enumerate(blobs[p].split('\n'), 1):
            if not line.strip():
                continue
            c = need(loads(line, f'{p}:{n}'), ('kind', 'session', 'condition', 'attemptId', 'turn'), f'{p}:{n}')
            if c['kind'] != 'compact':
                continue
            key = (prov, c['session'], c['condition'], c['attemptId'], c['turn'])
            if key in calls:
                raise AuditError(f'calls 중복 key: {key}')
            s = c.get('stopReason')
            calls[key] = s if isinstance(s, str) and s else 'unknown'
    answers, summaries, seen, tpl_of = [], [], set(), {}
    for prov, cond, p in results:
        r = need(loads(blobs[p], p), ('session', 'template', 'condition', 'attemptId', 'turns'), p)
        sess, tpl, aid = r['session'], r['template'], r['attemptId']
        if r['condition'] != cond or tpl not in TEMPLATES or not isinstance(sess, str) or not sess:
            raise AuditError(f'조건/템플릿/세션 불일치: {p}')
        if not isinstance(aid, (str, int)) or isinstance(aid, bool):
            raise AuditError(f'attemptId 형식 오류: {p}')
        if tpl_of.setdefault(sess, tpl) != tpl:
            raise AuditError(f'세션 template 변경: {sess}')
        if (prov, cond, sess) in seen:
            raise AuditError(f'중복 세션 결과: {prov} {cond} {sess}')
        seen.add((prov, cond, sess))
        turns = r['turns']
        nums = [t.get('turn') if isinstance(t, dict) else None for t in turns] if isinstance(turns, list) else []
        if len(nums) != TURNS or any(type(x) is not int for x in nums) or nums != list(range(1, TURNS + 1)):
            raise AuditError(f'턴 구성 오류(세션당 {TURNS}턴 필요): {p}')
        for t in turns:
            need(t, ('turn', 'question', 'gold', 'answer'), p)
            n = t['turn']
            if not (isinstance(t['question'], str) and isinstance(t['answer'], str)
                    and isinstance(t['gold'], list) and all(isinstance(g, str) for g in t['gold'])):
                raise AuditError(f'질문/골드/답 형식 오류: {p} turn {n}')
            base = {'question': t['question'], 'gold': t['gold'], 'answer': t['answer']}
            answers.append(make_entry(prov, cond, tpl, sess, n, 'answer', p, 'not_applicable', dict(base)))
            if ('summary' in t) != (cond in SUMMARY_CONDITIONS and n in SUMMARY_TURNS):
                raise AuditError(f'요약 위치 오류(S1/S3의 3·6턴만): {p} turn {n}')
            if 'summary' in t:
                if not isinstance(t['summary'], str):
                    raise AuditError(f'summary 형식 오류: {p} turn {n}')
                key = (prov, sess, cond, aid, n)
                if key not in calls:
                    raise AuditError(f'summary에 연결된 call 없음: {key}')
                summaries.append(make_entry(prov, cond, tpl, sess, n, 'summary', p, calls[key],
                                            {**base, 'summary': t['summary']}))
    for prov in PROVIDERS:
        for cond in CONDITIONS:
            if sum(1 for k in seen if k[0] == prov and k[1] == cond) != SESSIONS:
                raise AuditError(f'{prov}/{cond} 세션 수가 {SESSIONS}이 아님')
    if set(tpl_of.values()) != set(TEMPLATES):
        raise AuditError('템플릿 세 종이 모두 나타나지 않음')
    ids = [e['rec']['id'] for e in answers + summaries]
    if len(set(ids)) != len(ids):
        raise AuditError('모집단 id 충돌')
    if len(answers) != 1920 or len(summaries) != 192:
        raise AuditError(f'모집단 크기 오류: answer={len(answers)} summary={len(summaries)}')
    return answers, summaries


def stratify(entries, with_turn):
    strata = {}
    for e in entries:
        r = e['rec']
        key = (r['provider'], r['condition'], r['template']) + ((r['turn'],) if with_turn else ())
        strata.setdefault(key, []).append(e)
    return strata


def build():
    answers, summaries = load_population()
    order = lambda e: (e['full'], e['canon'])
    a_strata, s_strata = stratify(answers, False), stratify(summaries, True)
    if len(a_strata) != 30 or len(s_strata) != 24:
        raise AuditError(f'층 수 오류: answer={len(a_strata)} summary={len(s_strata)}')
    chosen = []
    for key in sorted(a_strata):
        picked, sessions = [], set()
        for e in sorted(a_strata[key], key=order):  # first two distinct sessions, no re-draw
            if e['rec']['session'] not in sessions:
                sessions.add(e['rec']['session'])
                picked.append(e)
            if len(picked) == 2:
                break
        if len(picked) < 2:
            raise AuditError(f'서로 다른 세션 2건 부족: {key}')
        chosen += picked
    for key in sorted(s_strata):
        chosen.append(min(s_strata[key], key=order))
    selected = sorted((e['rec'] for e in chosen), key=lambda r: r['id'])
    if len(selected) != 84:
        raise AuditError(f'표본 크기 오류: {len(selected)}')
    stops = {}
    for e in summaries:
        r = e['rec']
        c = stops.setdefault(r['provider'], {}).setdefault(r['condition'], Counter())
        c[r['stop']] += 1
    metadata = {'answer_population': len(answers), 'summary_population': len(summaries),
                'summary_stops': {p: {c: dict(sorted(n.items())) for c, n in sorted(cs.items())}
                                  for p, cs in sorted(stops.items())},
                'answer_strata': len(a_strata), 'summary_strata': len(s_strata)}
    return selected, metadata


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--blind', action='store_true', help='print only the blind payload array as JSON')
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        sel, meta = build()
    except AuditError as exc:
        sys.exit(f'prepare 중단: {exc}')
    out = [r['blind'] for r in sel] if args.blind else {'selected': len(sel), **meta}
    print(json.dumps(out, ensure_ascii=False, indent=2))
