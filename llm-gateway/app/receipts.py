"""PDF receipt for a paid top-up."""
import pathlib

from fpdf import FPDF

from .billing import usd

FONTS = pathlib.Path(__file__).resolve().parent / "fonts"
METHOD = {"platega": "СБП / банковская карта (Platega)", "cryptobot": "Криптовалюта (CryptoBot)"}


def render(p, user, general: dict, bonus: float = 0.0, rate: float = 95.0) -> bytes:
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(True, 15)
    pdf.add_font("Sans", "", str(FONTS / "LiberationSans-Regular.ttf"))
    pdf.add_font("Sans", "B", str(FONTS / "LiberationSans-Bold.ttf"))
    pdf.add_page()
    pdf.set_margins(20, 20, 20)
    site = general.get("site_name") or "kvotum"

    pdf.set_font("Sans", "B", 20)
    pdf.cell(0, 10, site, new_x="LMARGIN", new_y="NEXT", align="L")
    legal = (general.get("legal_info") or "").strip()
    pdf.set_font("Sans", "", 9)
    pdf.set_text_color(110, 110, 110)
    if legal:
        pdf.multi_cell(0, 4.5, legal, new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.ln(8)

    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Sans", "B", 15)
    pdf.cell(0, 8, f"Квитанция об оплате № {p.id[:8].upper()}", new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.set_font("Sans", "", 10)
    paid = p.paid_at or p.created_at
    pdf.cell(0, 6, f"от {paid.strftime('%d.%m.%Y %H:%M')} UTC", new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.ln(6)

    if p.currency == "RUB":
        amount = f"{p.amount:,.2f} руб.".replace(",", " ")
    else:
        amount = f"{p.amount:,.2f} {p.currency}".replace(",", " ")
    credited = usd(p.amount_usd)
    # the balance is shown in rubles: a ruble payment credits exactly what was paid, other currencies the service rate
    kurs = p.amount / credited if p.currency == "RUB" and credited else rate
    rubles = lambda v: f"{v * kurs:,.2f} руб.".replace(",", " ")
    rows = [
        ("Плательщик", user.email if user else "—"),
        ("Назначение", f"Пополнение баланса на сервисе {site}"),
        ("Способ оплаты", METHOD.get(p.method, p.method)),
        ("Сумма оплаты", amount),
        ("Зачислено на баланс", rubles(credited)),
    ]
    if p.currency != "RUB":
        rows.append(("Курс", f"{rate:,.2f} руб. за $1".replace(",", " ")))
    if bonus > 0:
        rows.append(("Бонус к пополнению", "+" + rubles(bonus)))
    rows += [("Статус", "Оплачено"), ("ID платежа", p.id)]
    if p.external_id:
        rows.append(("ID у платёжной системы", p.external_id))

    pdf.set_draw_color(220, 220, 220)
    for k, v in rows:
        y = pdf.get_y()
        pdf.set_font("Sans", "", 10)
        pdf.set_text_color(110, 110, 110)
        pdf.cell(60, 9, k)
        pdf.set_text_color(0, 0, 0)
        pdf.set_font("Sans", "B" if k in ("Сумма оплаты", "Зачислено на баланс") else "", 10)
        pdf.multi_cell(0, 9, str(v), new_x="LMARGIN", new_y="NEXT", align="L")
        pdf.line(20, max(pdf.get_y(), y + 9), 190, max(pdf.get_y(), y + 9))

    pdf.ln(10)
    pdf.set_font("Sans", "", 8.5)
    pdf.set_text_color(130, 130, 130)
    pdf.multi_cell(0, 4.5, "Документ подтверждает зачисление средств на баланс личного кабинета. "
                           "Он сформирован автоматически и не является кассовым (фискальным) чеком.",
                   new_x="LMARGIN", new_y="NEXT", align="L")
    if general.get("support_contact"):
        pdf.multi_cell(0, 4.5, f"Поддержка: {general['support_contact']}", new_x="LMARGIN", new_y="NEXT", align="L")
    return bytes(pdf.output())
