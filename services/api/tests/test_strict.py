import pytest

from tests.strict import strict_mode_enabled


@pytest.mark.parametrize(
    ("value", "expected"),
    [("1", True), ("0", False), ("", False), (None, False), ("true", False)],
)
def test_strict_mode_is_on_only_for_exactly_1(value: str | None, expected: bool) -> None:
    assert strict_mode_enabled(value) is expected
