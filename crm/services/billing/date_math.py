from __future__ import annotations

from datetime import date


def first_day_of_month(d: date) -> date:
    return date(d.year, d.month, 1)


def last_day_of_month(d: date) -> date:
    # prosta arytmetyka miesięcy bez zewnętrznych zależności
    if d.month == 12:
        next_month = date(d.year + 1, 1, 1)
    else:
        next_month = date(d.year, d.month + 1, 1)
    return next_month.fromordinal(next_month.toordinal() - 1)


def add_months(d: date, months: int) -> date:
    # zachowujemy dzień, ale „ściskamy” jeśli nowy miesiąc ma mniej dni
    year = d.year + (d.month - 1 + months) // 12
    month = (d.month - 1 + months) % 12 + 1
    day = d.day

    # clamp day to last day of target month
    ld = last_day_of_month(date(year, month, 1)).day
    if day > ld:
        day = ld
    return date(year, month, day)


def effective_first_day_after_full_next_period(requested_at: date) -> date:
    """Reguła CRM ISP: downgrade/terminate wchodzą po pełnym kolejnym okresie.

    Praktycznie: request w styczniu -> effective 01.03.
    """

    return add_months(first_day_of_month(requested_at), 2)
