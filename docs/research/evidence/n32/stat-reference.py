import json, math, statistics, pathlib
a = json.loads(pathlib.Path(__file__).with_name('measurement-attempt-1.json').read_text(encoding='utf-8'))
def draws():
    state = 0x4e173002
    while True:
        state = (state + 0x6d2b79f5) & 0xffffffff
        n = ((state ^ (state >> 15)) * (state | 1)) & 0xffffffff
        n ^= (n + (((n ^ (n >> 7)) * (n | 61)) & 0xffffffff)) & 0xffffffff
        yield ((n ^ (n >> 14)) & 0xffffffff) / 4294967296
def close(x,y): assert math.isclose(x,y,rel_tol=1e-13,abs_tol=1e-13), (x,y)
for r in a['analysis']['recipes']:
    rows = [x for x in a['samples'] if x['recipeId'] == r['recipeId']]
    ratios, aa = [], []
    for i in range(36):
        cells = {x['variant']:x['elapsedNs'] for x in rows if x['round'] == i}
        ratios.append(cells['B'] / ((cells['A'] + cells['A-prime']) / 2))
        aa.append(cells['A-prime'] / cells['A'])
    close(statistics.median(ratios),r['pointEstimate'])
    close(statistics.median(aa),r['aaRatio'])
    rng=draws(); estimates=[]
    for _ in range(10000):
        sample=[]
        for _ in range(6):
            block=int(next(rng)*6)
            sample.extend(ratios[block*6:block*6+6])
        estimates.append(statistics.median(sample))
    estimates.sort()
    for p, actual in zip([.025,.975],r['bootstrap']['ci']):
        pos=9999*p; lo=int(pos)
        close(estimates[lo]+(estimates[math.ceil(pos)]-estimates[lo])*(pos-lo),actual)
    for i, actual in enumerate(r['blockMedians']): close(statistics.median(ratios[6*i:6*i+6]),actual)
    for variant, actual in r['variantMedianNs'].items(): close(statistics.median([x['elapsedNs'] for x in rows if x['variant']==variant]),actual)
print('PASS: Python reference reproduces all 28 point estimates, A-prime/A ratios, 95% block-bootstrap intervals, six block medians and variant medians.')
