"""Calculator tools: basic arithmetic for the Strands agent."""

from strands import tool


@tool
def add(a: float, b: float) -> str:
    """Add two numbers together. Use when the user asks to add, sum, or find the total of two numbers.

    Args:
        a: First number
        b: Second number

    Returns:
        The sum of a and b
    """
    result = a + b
    return str(int(result)) if result == int(result) else str(result)


@tool
def subtract(a: float, b: float) -> str:
    """Subtract the second number from the first. Use when the user asks to subtract, find the difference, or take away.

    Args:
        a: Number to subtract from
        b: Number to subtract

    Returns:
        The difference of a minus b
    """
    result = a - b
    return str(int(result)) if result == int(result) else str(result)


@tool
def multiply(a: float, b: float) -> str:
    """Multiply two numbers. Use when the user asks to multiply, find the product, or calculate times.

    Args:
        a: First number
        b: Second number

    Returns:
        The product of a times b
    """
    result = a * b
    return str(int(result)) if result == int(result) else str(result)


@tool
def divide(a: float, b: float) -> str:
    """Divide the first number by the second. Use when the user asks to divide, find the quotient, or split.

    Args:
        a: Dividend (number to divide)
        b: Divisor (number to divide by)

    Returns:
        The quotient of a divided by b
    """
    if b == 0:
        return "Error: Division by zero"
    result = a / b
    return str(int(result)) if result == int(result) else str(result)
