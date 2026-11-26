import unittest

from PIL import Image, ImageChops

from stimuli import MOVED, ORIGINAL, make_pair

SIZE = (1280, 200)


def make_bare(size=SIZE):
    image = Image.new('L', size, 255)
    image.paste(190, ORIGINAL)
    return image


def make_layer(*marks, size=SIZE):
    layer = Image.new('L', size, 255)
    for box, shade in marks:
        layer.paste(shade, box)
    return layer


def compose(bare, layer):
    image = bare.copy()
    image.paste(0, mask=ImageChops.invert(layer))
    return image


class MakePairTest(unittest.TestCase):
    def assert_rejected(self, bare, layer, historical=None):
        if historical is None:
            historical = compose(bare, layer)
        with self.assertRaises(ValueError):
            make_pair(bare, layer, historical)

    def assert_same(self, actual, expected):
        self.assertEqual((actual.mode, actual.size), (expected.mode, expected.size))
        self.assertEqual(actual.tobytes(), expected.tobytes())

    def test_constants_cover_full_stripe_length(self):
        self.assertEqual(ORIGINAL, (24, 150, 1256, 152))
        self.assertEqual(MOVED, (24, 156, 1256, 158))

    def test_white_layer_moves_only_the_stripe(self):
        bare, layer = make_bare(), make_layer()
        moved_bare, moved_planted = make_pair(bare, layer, compose(bare, layer))
        expected = Image.new('L', SIZE, 255)
        expected.paste(190, MOVED)
        self.assert_same(moved_bare, expected)
        self.assert_same(moved_planted, expected)

    def test_grey_glyph_crossing_old_rule_keeps_its_antialias(self):
        bare = make_bare()
        layer = make_layer(((100, 140, 110, 155), 0), ((110, 140, 111, 155), 128))
        historical = compose(bare, layer)
        moved_bare, moved_planted = make_pair(bare, layer, historical)
        self.assert_same(moved_planted, compose(moved_bare, layer))
        self.assertEqual(moved_planted.getpixel((105, 151)), 0)
        self.assertEqual(moved_planted.getpixel((110, 151)), 128)
        self.assertLess(historical.getpixel((110, 151)), 128)
        self.assertEqual(moved_planted.getpixel((110, 156)), 190)

    def test_arguments_are_not_mutated(self):
        bare = make_bare()
        layer = make_layer(((100, 140, 110, 155), 64))
        historical = compose(bare, layer)
        arguments = (bare, layer, historical)
        before = [image.tobytes() for image in arguments]
        results = make_pair(*arguments)
        self.assertEqual([image.tobytes() for image in arguments], before)
        for result in results:
            self.assertTrue(all(result is not image for image in arguments))

    def test_unrelated_bare_content_is_preserved(self):
        bare = make_bare()
        bare.paste(77, (300, 20, 320, 40))
        layer = make_layer()
        moved_bare, _ = make_pair(bare, layer, compose(bare, layer))
        self.assertEqual(moved_bare.crop((300, 20, 320, 40)).getextrema(), (77, 77))

    def test_rejects_accidental_edits_in_historical(self):
        bare = make_bare()
        layer = make_layer(((100, 140, 110, 155), 0))
        for point in ((0, 0), (23, 150), (500, 149), (500, 151), (500, 156), (1279, 199)):
            with self.subTest(point=point):
                historical = compose(bare, layer)
                historical.putpixel(point, 17)
                self.assert_rejected(bare, layer, historical)

    def test_rejects_offset_layer(self):
        bare = make_bare()
        historical = compose(bare, make_layer(((100, 140, 110, 155), 0)))
        self.assert_rejected(bare, make_layer(((101, 140, 111, 155), 0)), historical)

    def test_rejects_offset_stripe(self):
        left, top, right, bottom = ORIGINAL
        bare = Image.new('L', SIZE, 255)
        bare.paste(190, (left, top + 1, right, bottom + 1))
        self.assert_rejected(bare, make_layer())

    def test_rejects_wrong_shade_at_either_end(self):
        cases = (
            ((ORIGINAL[0], ORIGINAL[1]), 189),
            ((ORIGINAL[2] - 1, ORIGINAL[3] - 1), 191),
            ((MOVED[0], MOVED[1]), 254),
            ((MOVED[2] - 1, MOVED[3] - 1), 0),
        )
        for point, shade in cases:
            with self.subTest(point=point):
                bare = make_bare()
                bare.putpixel(point, shade)
                self.assert_rejected(bare, make_layer())

    def test_rejects_out_of_bounds_geometry(self):
        for size in ((MOVED[2] - 1, 200), (1280, MOVED[3] - 1)):
            with self.subTest(size=size):
                self.assert_rejected(make_bare(size), make_layer(size=size))

    def test_accepts_smallest_in_bounds_size(self):
        size = (MOVED[2], MOVED[3])
        bare, layer = make_bare(size), make_layer(size=size)
        moved_bare, _ = make_pair(bare, layer, compose(bare, layer))
        self.assertEqual(moved_bare.size, size)

    def test_rejects_size_mismatch(self):
        bare, layer = make_bare(), make_layer()
        self.assert_rejected(bare, make_layer(size=(1281, 200)), bare.copy())
        self.assert_rejected(bare, layer, make_bare((1280, 201)))

    def test_rejects_non_l_mode(self):
        for index in range(3):
            for mode in ('RGB', 'LA', '1'):
                with self.subTest(index=index, mode=mode):
                    images = [make_bare(), make_layer(), make_bare()]
                    images[index] = images[index].convert(mode)
                    self.assert_rejected(*images)

    def test_rejects_transparency(self):
        for index in range(3):
            with self.subTest(index=index):
                images = [make_bare(), make_layer(), make_bare()]
                images[index].info['transparency'] = 255
                self.assert_rejected(*images)

    def test_rejects_new_overlap_including_faint_antialias(self):
        for shade in (0, 128, 254):
            for point in ((MOVED[0], MOVED[1]), (MOVED[2] - 1, MOVED[3] - 1)):
                with self.subTest(shade=shade, point=point):
                    layer = make_layer()
                    layer.putpixel(point, shade)
                    self.assert_rejected(make_bare(), layer)

    def test_accepts_glyph_just_outside_destination(self):
        left, top, right, bottom = MOVED
        for point in ((left - 1, top), (right, top), (left, top - 1), (left, bottom)):
            with self.subTest(point=point):
                bare = make_bare()
                layer = make_layer()
                layer.putpixel(point, 0)
                _, moved_planted = make_pair(bare, layer, compose(bare, layer))
                self.assertEqual(moved_planted.getpixel(point), 0)

    def test_rejects_glyph_over_other_nonwhite_bare_content(self):
        bare = make_bare()
        bare.putpixel((300, 30), 254)
        layer = make_layer()
        layer.putpixel((300, 30), 254)
        self.assert_rejected(bare, layer)


if __name__ == '__main__':
    unittest.main()
