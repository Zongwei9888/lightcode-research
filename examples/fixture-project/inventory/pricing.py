"""Order pricing."""


def line_total(unit_price, quantity, discount=0.0):
    """Price of one order line after a fractional discount (0.1 means 10% off)."""
    if quantity < 0:
        raise ValueError("quantity must not be negative")
    return round(unit_price * quantity * (1 - discount), 2)


def order_total(lines, tax_rate):
    """Sum of the line totals plus tax."""
    subtotal = sum(line_total(*line) for line in lines)
    return round(subtotal * (1 + tax_rate), 2)
