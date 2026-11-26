# Pure in-memory builder for the header-window safety variants (no file IO).
# Authoring note: written without tool access; not executed by the author.
import copy
import hashlib

SET_NAME = 'ko-header-window-safety'
DONORS = ('q4e547a01', 'q2acfaa75', 'q083bb210')
CONDITIONS = ('control', 'gap-aligned', 'outer-aligned', 'gap-offset', 'outer-offset')
SIDE_VALUES = dict(zip(DONORS, ('87', '89', '91')))
SIDE_LEFT = {'gap': 530, 'outer': 990}
VALUE_TOP = {'aligned': 104, 'offset': 122}
SIDE_IDS = ('side-name', 'side-value')


def _variant_id(donor, condition):
    key = f'ko-header-window-v1/{donor}/{condition}'.encode('utf-8')
    return 'q' + hashlib.sha256(key).hexdigest()[:8]


def _entries(container, key):
    if not isinstance(container, dict) or not isinstance(container.get(key), list):
        raise ValueError(f'input must be a dict with a list under {key!r}')
    entries = container[key]
    if not all(isinstance(entry, dict) for entry in entries):
        raise ValueError(f'every entry of {key!r} must be a dict')
    return entries


def _only_match(entries, donor, label):
    matches = [entry for entry in entries if entry.get('id') == donor]
    if not matches:
        raise ValueError(f'missing {label} for donor {donor}')
    if len(matches) > 1:
        raise ValueError(f'duplicate {label} for donor {donor}')
    return matches[0]


def _check_page(page, donor):
    items = page.get('items')
    if not isinstance(items, list) or not all(isinstance(item, dict) for item in items):
        raise ValueError(f'invalid items for donor {donor}')
    if any(item.get('id') in SIDE_IDS for item in items):
        raise ValueError(f'donor {donor} already uses a reserved side item id')


def _check_question(entry, donor):
    text = entry.get('question')
    if not isinstance(text, str) or not text.strip():
        raise ValueError(f'blank or invalid question for donor {donor}')


def _side_item(item_id, role, text, left, top):
    return {
        'id': item_id,
        'role': role,
        'text': text,
        'cell': [left, top, left + 80, top + 40],
        'size': 'body',
        'record': 3,
    }


def _side_items(donor, condition):
    placement, alignment = condition.split('-')
    left = SIDE_LEFT[placement]
    return [
        _side_item('side-name', 'other_record_label', '별관', left, 30),
        _side_item('side-value', 'other_record_value', SIDE_VALUES[donor], left, VALUE_TOP[alignment]),
    ]


def build_variants(prior_design, prior_questions):
    pages = _entries(prior_design, 'images')
    question_entries = _entries(prior_questions, 'questions')
    for key in ('version', 'font'):
        if key not in prior_design:
            raise ValueError(f'prior design is missing {key!r}')

    # Validate every donor before building anything.
    sources = []
    for donor in DONORS:
        page = _only_match(pages, donor, 'page')
        question = _only_match(question_entries, donor, 'question')
        _check_page(page, donor)
        _check_question(question, donor)
        sources.append((donor, page, question['question']))

    images, questions, roster = [], [], []
    seen_ids = set()
    for donor, source_page, question_text in sources:
        for condition in CONDITIONS:
            new_id = _variant_id(donor, condition)
            if new_id in seen_ids:
                raise ValueError(f'variant id collision: {new_id}')
            seen_ids.add(new_id)

            page = copy.deepcopy(source_page)
            page['id'] = new_id
            page['file'] = new_id + '.png'
            if condition != 'control':
                page['items'].extend(_side_items(donor, condition))

            images.append(page)
            questions.append({'id': new_id, 'file': new_id + '.png', 'question': question_text})
            roster.append({'id': new_id, 'donor': donor, 'condition': condition})

    design = {
        'version': copy.deepcopy(prior_design['version']),
        'set': SET_NAME,
        'font': copy.deepcopy(prior_design['font']),
        'images': images,
    }
    return design, {'questions': questions}, roster
