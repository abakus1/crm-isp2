# CRM-ISP2 (CRM GEMINI) — Modularny CRM ISP

**crm-isp2** to nowa generacja naszego CRM.  
Zmiana nie dotyczy tylko kodu — zmieniamy **strukturę i podejście architektoniczne**.

System jest budowany jako **modułowy monolit**, gdzie każdy element (bounded context) ma swój własny katalog i trzyma swoje części razem:
- API
- serwisy (use-case)
- logikę domenową
- kontrakty (schemas)
- zależności bezpieczeństwa (RBAC / identity)

Aplikacja główna jedynie rejestruje moduły — nie zna ich wewnętrznej struktury.

Repozytorium: `crm-isp2`  
Branch główny: `main`

---

# 🧠 Główna idea architektury

1. Każdy moduł jest samowystarczalny.
2. Moduły nie ingerują w siebie bezpośrednio.
3. Wspólna infrastruktura znajduje się w `core` i `shared`.
4. Integracje zewnętrzne są izolowane w `adapters`.
5. Logika biznesowa nigdy nie trafia do endpointów ani modeli ORM.

To jest fundament pod dalszy rozwój systemu billingowego, provisioningowego i operacyjnego.

---

# 📁 Struktura projektu

```
crm-isp2/
├─ crm/
│  ├─ app/                # tworzenie aplikacji FastAPI, middleware, private-by-default
│  ├─ core/               # konfiguracja, DB, security, audit (infrastruktura wspólna)
│  ├─ db/                 # session + modele ORM + repozytoria
│  ├─ shared/             # wspólne utilsy, errors, enums, request context
│  ├─ adapters/           # integracje zewnętrzne (Optima, bank, RADIUS, GPON, Asterisk)
│  │
│  ├─ users/              # ✅ Moduł IAM (Identity / Staff / RBAC)
│  │   ├─ module.py
│  │   ├─ routes.py
│  │   ├─ api/
│  │   ├─ services/
│  │   └─ identity/
│  │
│  ├─ api/                # placeholder pod przyszłe moduły
│  ├─ domains/            # placeholder pod przyszłe moduły
│  └─ services/           # placeholder pod przyszłe moduły
│
├─ alembic/               # migracje bazy danych
├─ env/                   # konfiguracja środowiskowa (.env)
├─ frontend/crm-web/      # frontend (Next.js)
├─ requirements.txt
└─ alembic.ini
```

---

# ✅ Aktualnie działający moduł: `users`

`crm/users` to pierwszy w pełni działający moduł w nowej architekturze.

Zawiera:

- Identity (login, bootstrap, self-service)
- Staff lifecycle
- RBAC (roles + actions)
- JWT + token_version (kill-switch)
- TOTP (MFA)
- Guardrails administracyjne

Moduł jest rejestrowany w `crm/app/main.py` przez funkcję `register_users(app)`.

To jest wzorzec dla wszystkich kolejnych modułów.

---

# 🧱 Jak dodawać nowy moduł

Nowy moduł powinien mieć strukturę podobną do:

```
crm/<module_name>/
├─ module.py
├─ routes.py
├─ api/
├─ services/
├─ domain/
└─ schemas.py
```

W `crm/app/main.py` dopisujemy jedynie:

```python
from crm.<module_name>.module import register as register_<module_name>

register_<module_name>(app)
```

Bez grzebania w innych częściach systemu.

---

# 🔐 Warstwa bezpieczeństwa

System działa w modelu:

- Private-by-default (wszystkie endpointy wymagają JWT poza `/health` i identity)
- Obsługa reverse proxy (`X-Forwarded-For`)
- Allowlist IP (opcjonalnie)
- Request context (IP, user-agent, request-id)
- Audit i activity log
- RBAC z centralnym `require(action)`

---

# 🗄 Baza danych

- PostgreSQL
- Alembic migrations
- Role: admin / writer / reader
- Migracje uruchamiane jako admin
- Runtime aplikacji jako writer
- Raporty jako reader

To zapewnia kontrolę dostępu i izolację warstw.

---

# 🚀 Uruchomienie backendu

### 1) Środowisko

```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2) Start aplikacji

```
uvicorn crm.app.main:create_app --factory --reload --host 0.0.0.0 --port 8000
```

Health check:

```
GET /health
```

---

# 🌐 Frontend

```
cd frontend/crm-web
npm install
npm run dev
```

---

# 🎯 Cel projektu

crm-isp2 to fundament pod:

- Billing engine
- Integrację z Optimą
- Provisioning (RADIUS / GPON / Asterisk)
- OSS-lite network management
- Modularny rozwój bez chaosu zależności

To nie jest już „zbiór endpointów”.
To jest kontrolowany, modułowy system operacyjny dla ISP.

---

# Status

- Moduł IAM działa
- Struktura pod kolejne moduły przygotowana
- Repo czyste i zsynchronizowane z origin/main

Kolejny krok: migracja pozostałych domen do modelu modułowego.


---

# 🔍 Logowanie operacji (Audit + Activity)

W systemie mamy **dwa typy logów**:

1) **audit_log** – zdarzenia bezpieczeństwa / krytyczne (np. login, zmiana hasła, disable/enable pracownika).
   - Zwykle zawiera *before/after*.

2) **activity_log** – “kto kliknął co w systemie”.
   - To jest nasz **pas bezpieczeństwa**: jeśli endpoint zmienia dane (POST/PUT/PATCH/DELETE), to zapisujemy zdarzenie.

## Jak to działa (prosto)

- Middleware `crm/core/audit/activity_middleware.py` łapie wszystkie żądania:
  - POST / PUT / PATCH / DELETE
- Wrzuca rekord do `crm.activity_log` z:
  - `action` = np. `PUT /staff/123`
  - `meta` = metoda, ścieżka, status HTTP, czas, request_id, IP, user-agent (ucięty), lista kluczy query (bez wartości)

Dzięki temu:
- mamy ślad audytowy “kto i kiedy coś robił” (ważne pod NIS2 i wewnętrzne audyty),
- a jednocześnie nie zalewamy bazy logami z GET-ów.

