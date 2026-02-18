# CRM-ISP (CRM GEMINI)

Kanoniczna struktura projektu jest schodkowa i wymusza kierunek zależności:

api → services → domains → db
adapters = integracje na brzegu (Optima, bank, RADIUS, GPON, Asterisk, AVIOS)

Zasady:
- Brak logiki biznesowej w endpointach (api) i w modelach ORM.
- Logika biznesowa wyłącznie w service/use-case + rules w domenach.
- Domeny nie importują: api, adapters, db.
- Integracje realizowane wyłącznie przez adapters (na brzegu).
- Uprawnienia: policies (RBAC + field permissions), egzekwowane w warstwie services.

## Core modules (bounded contexts)

- subscribers: abonenci (person / JDG-CEIDG / company), status operacyjny + accounting_status
- company: dane operatora/tenant + konfiguracje (rachunki firmowe, ustawienia globalne)
- staff: pracownicy/IAM (role, dostępy; egzekwowanie przez policies)
- contracts: umowy + edytor szablonów + aliasy pól + snapshot dokumentu
- billing: naliczenia/dokumenty wewnętrzne + eksport do Optimy (SoR)
- payments: wpłaty (kasa gotówka/karta), alokacje do dokumentów, eksport do Optimy
- inventory: magazyn sprzętu klienta (wejścia/wyjścia/przesunięcia, sztuki SN/MAC, wypożyczenia)
- support: zgłoszenia + komunikacja z abonentem (panel ↔ staff)
- scheduling: kalendarz wizyt/terminów (rezerwacje, przydziały, statusy)
- network: definicje sieci/puli IPv4/IPv6 (DHCP/PPPoE/STATIC, NAT/public/mgmt, VLAN/VRF)
- assets: infrastruktura ISP (urządzenia, interfejsy, przypięcia do segmentów)

🔐 Security Architecture (IAM Core)

System posiada wbudowany, warstwowy mechanizm bezpieczeństwa dla staff/admin API:

1️⃣ Authentication

JWT (z token_version kill-switch)

TOTP (MFA)

Bootstrap mode z kontrolą wygaszenia

2️⃣ Throttle & Lockout

Lockout per user (threshold + exponential backoff)

Lockout per IP (spray protection)

Global window time

Dane w tabeli crm.auth_throttle

3️⃣ Idle Timeout

staff_users.last_seen_at

Weryfikacja bezczynności w jwt_deps

Wygaszenie sesji bez unieważniania tokenu globalnie

4️⃣ Token Revocation

token_version w JWT

Zmiana version → natychmiastowa invalidacja wszystkich tokenów użytkownika

5️⃣ Private-by-default API

Wszystkie endpointy wymagają Bearer token (poza /identity/login i /health)

6️⃣ IP Allowlist (opcjonalne)

Globalna allowlista dla staff/admin API

Docelowo zarządzana z panelu ADMIN