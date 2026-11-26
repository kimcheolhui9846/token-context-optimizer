# All fixtures are artificial. Only the fixed donor ids come from the specification.
import copy
import hashlib
import unittest

from variants import build_variants

DONORS = ['q4e547a01', 'q2acfaa75', 'q083bb210']
CONDITIONS = ['control', 'gap-aligned', 'outer-aligned', 'gap-offset', 'outer-offset']
SIDE_VALUES = {'q4e547a01': '87', 'q2acfaa75': '89', 'q083bb210': '91'}


def make_page(page_id, number):
    return {
        'id': page_id,
        'file': page_id + '.png',
        'page': {'width': 1200, 'height': 800, 'number': number},
        'items': [
            {'id': 'head', 'role': 'header', 'text': '가상 머리글', 'cell': [10, 30, 200, 70], 'size': 'body'},
            {'id': 'value', 'role': 'value', 'text': '12', 'cell': [10, 104, 200, 144], 'size': 'body', 'record': 1},
        ],
        'rules': [[0, 80, 500, 80]],
        'targetHeaderItem': 'head',
        'goldItems': ['head', 'value'],
    }


def make_inputs():
    ids = ['qunused00'] + list(reversed(DONORS))
    design = {
        'version': 7,
        'set': 'artificial-prior',
        'font': {'family': 'Artificial Sans', 'sizes': {'body': 20}},
        'images': [make_page(page_id, n) for n, page_id in enumerate(ids)],
    }
    questions = {
        'questions': [
            {'id': page_id, 'file': page_id + '.png', 'question': f'가상 문항 {n}: 머리글의 값은?'}
            for n, page_id in enumerate(ids)
        ]
    }
    return design, questions


def expected_id(donor, condition):
    key = ('ko-header-window-v1/' + donor + '/' + condition).encode('utf-8')
    return 'q' + hashlib.sha256(key).hexdigest()[:8]


class BuildVariantsTest(unittest.TestCase):
    def setUp(self):
        self.prior_design, self.prior_questions = make_inputs()
        self.design, self.questions, self.roster = build_variants(self.prior_design, self.prior_questions)
        self.pages = {page['id']: page for page in self.design['images']}
        self.sources = {page['id']: page for page in self.prior_design['images']}

    def test_fifteen_rows_in_stable_order(self):
        pairs = [(d, c) for d in DONORS for c in CONDITIONS]
        ids = [expected_id(d, c) for d, c in pairs]
        self.assertEqual(len(set(ids)), 15)
        self.assertEqual([p['id'] for p in self.design['images']], ids)
        self.assertEqual([q['id'] for q in self.questions['questions']], ids)
        self.assertEqual(
            self.roster,
            [{'id': i, 'donor': d, 'condition': c} for i, (d, c) in zip(ids, pairs)],
        )
        again = build_variants(self.prior_design, self.prior_questions)
        self.assertEqual(again, (self.design, self.questions, self.roster))

    def test_top_level_metadata(self):
        self.assertEqual(set(self.design), {'version', 'set', 'font', 'images'})
        self.assertEqual(self.design['set'], 'ko-header-window-safety')
        self.assertEqual(self.design['version'], self.prior_design['version'])
        self.assertEqual(self.design['font'], self.prior_design['font'])

    def test_control_changes_only_id_and_file(self):
        for row in self.roster:
            if row['condition'] != 'control':
                continue
            expected = copy.deepcopy(self.sources[row['donor']])
            expected['id'] = row['id']
            expected['file'] = row['id'] + '.png'
            self.assertEqual(self.pages[row['id']], expected)

    def test_variant_placement_roles_and_baseline(self):
        layout = {
            'gap-aligned': (530, 104),
            'outer-aligned': (990, 104),
            'gap-offset': (530, 122),
            'outer-offset': (990, 122),
        }
        for row in self.roster:
            if row['condition'] == 'control':
                continue
            page = self.pages[row['id']]
            source = self.sources[row['donor']]
            left, top = layout[row['condition']]
            self.assertEqual(page['items'][:-2], source['items'])
            self.assertEqual(
                page['items'][-2:],
                [
                    {'id': 'side-name', 'role': 'other_record_label', 'text': '별관',
                     'cell': [left, 30, left + 80, 70], 'size': 'body', 'record': 3},
                    {'id': 'side-value', 'role': 'other_record_value', 'text': SIDE_VALUES[row['donor']],
                     'cell': [left, top, left + 80, top + 40], 'size': 'body', 'record': 3},
                ],
            )
            for key in set(source) - {'id', 'file', 'items'}:
                self.assertEqual(page[key], source[key])
            self.assertEqual(set(page), set(source))

    def test_source_is_immutable_and_outputs_are_independent(self):
        original_design, original_questions = make_inputs()
        self.assertEqual(self.prior_design, original_design)
        self.assertEqual(self.prior_questions, original_questions)
        first, second = self.design['images'][0], self.design['images'][1]
        first['items'][0]['cell'][0] = -1
        first['goldItems'].append('changed')
        self.design['font']['sizes']['body'] = -1
        self.assertEqual(self.prior_design, original_design)
        self.assertEqual(second['items'][0]['cell'][0], 10)
        self.assertEqual(second['goldItems'], ['head', 'value'])

    def test_questions_join_pages_and_donor_questions(self):
        originals = {q['id']: q['question'] for q in self.prior_questions['questions']}
        self.assertEqual(set(self.questions), {'questions'})
        for page, question, row in zip(self.design['images'], self.questions['questions'], self.roster):
            self.assertEqual(question['id'], page['id'])
            self.assertEqual(question['id'], row['id'])
            self.assertEqual(question['file'], page['file'])
            self.assertEqual(question['file'], question['id'] + '.png')
            self.assertEqual(question['question'], originals[row['donor']])

    def test_questions_do_not_leak_labels_or_answers(self):
        for question in self.questions['questions']:
            self.assertEqual(set(question), {'id', 'file', 'question'})
            for secret in CONDITIONS + DONORS + ['별관', '87', '89', '91']:
                self.assertNotIn(secret, question['question'])
            for value in question.values():
                for label in CONDITIONS + DONORS:
                    self.assertNotIn(label, value)


class InvalidInputTest(unittest.TestCase):
    def setUp(self):
        self.design, self.questions = make_inputs()

    def page(self, donor):
        return next(p for p in self.design['images'] if p['id'] == donor)

    def question(self, donor):
        return next(q for q in self.questions['questions'] if q['id'] == donor)

    def assert_rejected(self, message):
        with self.assertRaisesRegex(ValueError, message):
            build_variants(self.design, self.questions)

    def test_missing_donor_page(self):
        self.design['images'].remove(self.page(DONORS[1]))
        self.assert_rejected('missing page')

    def test_duplicate_donor_page(self):
        self.design['images'].append(copy.deepcopy(self.page(DONORS[0])))
        self.assert_rejected('duplicate page')

    def test_missing_donor_question(self):
        self.questions['questions'].remove(self.question(DONORS[2]))
        self.assert_rejected('missing question')

    def test_duplicate_donor_question(self):
        self.questions['questions'].append(copy.deepcopy(self.question(DONORS[0])))
        self.assert_rejected('duplicate question')

    def test_blank_or_non_string_question(self):
        for bad in ['', '   ', None, 3]:
            with self.subTest(bad=bad):
                self.question(DONORS[0])['question'] = bad
                self.assert_rejected('blank or invalid question')

    def test_invalid_items(self):
        for bad in [None, {}, ['not-a-dict']]:
            with self.subTest(bad=bad):
                self.page(DONORS[0])['items'] = bad
                self.assert_rejected('invalid items')

    def test_reserved_side_item_id(self):
        self.page(DONORS[0])['items'][0]['id'] = 'side-name'
        self.assert_rejected('reserved side item id')

    def test_missing_metadata(self):
        del self.design['font']
        self.assert_rejected('missing')

    def test_invalid_containers(self):
        for design, questions in [
            (None, self.questions),
            ({'images': None}, self.questions),
            (self.design, {}),
            (self.design, {'questions': ['not-a-dict']}),
        ]:
            with self.subTest(design=type(design), questions=type(questions)):
                with self.assertRaises(ValueError):
                    build_variants(design, questions)

    def test_unused_entries_are_not_validated(self):
        self.question('qunused00')['question'] = ''
        self.design['images'].append(copy.deepcopy(self.page('qunused00')))
        design, _, _ = build_variants(self.design, self.questions)
        self.assertEqual(len(design['images']), 15)


if __name__ == '__main__':
    unittest.main()
