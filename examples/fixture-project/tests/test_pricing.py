import unittest

from inventory import line_total, order_total


class LineTotalTests(unittest.TestCase):
    def test_line_00(self):
        self.assertAlmostEqual(line_total(1.5, 1, 0.0), 1.5)

    def test_line_01(self):
        self.assertAlmostEqual(line_total(2.5, 2, 0.1), 4.5)

    def test_line_02(self):
        self.assertAlmostEqual(line_total(3.5, 3, 0.2), 8.4)

    def test_line_03(self):
        self.assertAlmostEqual(line_total(4.5, 4, 0.0), 18.0)

    def test_line_04(self):
        self.assertAlmostEqual(line_total(5.5, 1, 0.1), 4.95)

    def test_line_05(self):
        self.assertAlmostEqual(line_total(6.5, 2, 0.2), 10.4)

    def test_line_06(self):
        self.assertAlmostEqual(line_total(7.5, 3, 0.0), 22.5)

    def test_line_07(self):
        self.assertAlmostEqual(line_total(8.5, 4, 0.1), 30.6)

    def test_line_08(self):
        self.assertAlmostEqual(line_total(9.5, 1, 0.2), 7.6)

    def test_line_09(self):
        self.assertAlmostEqual(line_total(10.5, 2, 0.0), 21.0)

    def test_line_10(self):
        self.assertAlmostEqual(line_total(11.5, 3, 0.1), 31.05)

    def test_line_11(self):
        self.assertAlmostEqual(line_total(12.5, 4, 0.2), 40.0)

    def test_line_12(self):
        self.assertAlmostEqual(line_total(13.5, 1, 0.0), 13.5)

    def test_line_13(self):
        self.assertAlmostEqual(line_total(14.5, 2, 0.1), 26.1)

    def test_line_14(self):
        self.assertAlmostEqual(line_total(15.5, 3, 0.2), 37.2)

    def test_line_15(self):
        self.assertAlmostEqual(line_total(16.5, 4, 0.0), 66.0)

    def test_line_16(self):
        self.assertAlmostEqual(line_total(17.5, 1, 0.1), 15.75)

    def test_line_17(self):
        self.assertAlmostEqual(line_total(18.5, 2, 0.2), 29.6)

    def test_line_18(self):
        self.assertAlmostEqual(line_total(19.5, 3, 0.0), 58.5)

    def test_line_19(self):
        self.assertAlmostEqual(line_total(20.5, 4, 0.1), 73.8)

    def test_line_20(self):
        self.assertAlmostEqual(line_total(21.5, 1, 0.2), 17.2)

    def test_line_21(self):
        self.assertAlmostEqual(line_total(22.5, 2, 0.0), 45.0)

    def test_line_22(self):
        self.assertAlmostEqual(line_total(23.5, 3, 0.1), 63.45)

    def test_line_23(self):
        self.assertAlmostEqual(line_total(24.5, 4, 0.2), 78.4)

    def test_line_24(self):
        self.assertAlmostEqual(line_total(25.5, 1, 0.0), 25.5)

    def test_line_25(self):
        self.assertAlmostEqual(line_total(26.5, 2, 0.1), 47.7)

    def test_line_26(self):
        self.assertAlmostEqual(line_total(27.5, 3, 0.2), 66.0)

    def test_line_27(self):
        self.assertAlmostEqual(line_total(28.5, 4, 0.0), 114.0)

    def test_line_28(self):
        self.assertAlmostEqual(line_total(29.5, 1, 0.1), 26.55)

    def test_line_29(self):
        self.assertAlmostEqual(line_total(30.5, 2, 0.2), 48.8)

    def test_line_30(self):
        self.assertAlmostEqual(line_total(31.5, 3, 0.0), 94.5)

    def test_line_31(self):
        self.assertAlmostEqual(line_total(32.5, 4, 0.1), 117.0)

    def test_line_32(self):
        self.assertAlmostEqual(line_total(33.5, 1, 0.2), 26.8)

    def test_line_33(self):
        self.assertAlmostEqual(line_total(34.5, 2, 0.0), 69.0)

    def test_line_34(self):
        self.assertAlmostEqual(line_total(35.5, 3, 0.1), 95.85)

    def test_line_35(self):
        self.assertAlmostEqual(line_total(36.5, 4, 0.2), 116.8)

    def test_line_36(self):
        self.assertAlmostEqual(line_total(37.5, 1, 0.0), 37.5)

    def test_line_37(self):
        self.assertAlmostEqual(line_total(38.5, 2, 0.1), 69.3)

    def test_line_38(self):
        self.assertAlmostEqual(line_total(39.5, 3, 0.2), 94.8)

    def test_line_39(self):
        self.assertAlmostEqual(line_total(40.5, 4, 0.0), 162.0)

    def test_negative_quantity(self):
        with self.assertRaises(ValueError):
            line_total(1.0, -1)


class OrderTotalTests(unittest.TestCase):
    def test_order_with_tax(self):
        self.assertAlmostEqual(order_total([(10.0, 2), (5.0, 1, 0.5)], 0.2), 27.0)


if __name__ == "__main__":
    unittest.main()
