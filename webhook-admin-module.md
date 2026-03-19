## Módulo de Administração de Webhooks – Plano

### Objetivo

Implementar, dentro desta plataforma Nexus (frontend React + backend FastAPI), um módulo de administração de webhooks de pagamento/assinatura, permitindo:

- Cadastro e gerenciamento de webhooks (por plano e status de usuário).
- Armazenamento de payloads recebidos para inspeção.
- Definição de mapeamentos de campos via JSON para uso por outro serviço de processamento.

### Decisões de Arquitetura

- **Backend**: reutilizar o backend atual em **FastAPI + SQLAlchemy + PostgreSQL** (`backend/main.py`, `backend/database.py`), sem introduzir um segundo backend Node/Prisma.
- **Modelagem**:
  - Tabela `webhooks` armazenando: `id`, `name`, `secret`, `is_active`, `field_mappings` (JSON), `plan_id` (string opcional), `user_status` (`active`/`expired`), `created_at`, `updated_at`.
  - Tabela `webhook_payloads` armazenando: `id`, `webhook_id`, `payload` (JSON), `headers` (JSON), `method`, `ip_address`, `user_agent`, `processed`, `processed_at`, `error`, `process_details` (JSON), `response_body` (JSON), `is_test`, `created_at`.
- **Endpoint público**: `POST /api/webhook/{secret}` (sem auth), que:
  - Localiza o `Webhook` pelo `secret` e verifica se existe.
  - Persiste um `WebhookPayload` com todos os dados da requisição.
  - Marca `is_test = not webhook.is_active` no momento do recebimento.
  - Deixa `processed = False` por padrão (processamento real ocorrerá em outro serviço).
- **Admin API (somente admin)** – prefixo `/api/platform/admin/webhooks*`:
  - `GET /api/platform/admin/webhooks` – lista todos os webhooks.
  - `GET /api/platform/admin/webhooks/{webhook_id}` – retorna um webhook.
  - `POST /api/platform/admin/webhooks` – cria webhook.
  - `PATCH /api/platform/admin/webhooks/{webhook_id}` – atualiza webhook (sem sobrescrever `field_mappings` quando não enviados).
  - `DELETE /api/platform/admin/webhooks/{webhook_id}` – exclui webhook.
  - `GET /api/platform/admin/webhook-payloads` – lista payloads com filtros (`webhook_id`, `processed`, `limit`).
  - `DELETE /api/platform/admin/webhook-payloads/{payload_id}` – exclui payload.

### Frontend

- **Rota protegida**: `/admin/webhooks`, acessível apenas via `AdminRoute` e visível no grupo **Admin** do `AppSidebar`.
- **Página**: `WebhookAdminPage` em `src/pages/admin/WebhookAdmin.tsx` com:
  - Aba **Webhooks**: tabela com colunas Ativo, Nome, Status de usuário controlado, URL pública, Criado em, Ações (Configurar, Excluir).
  - Diálogo de criação/edição de webhook (nome, plano opcional como string, status de usuário, toggle ativo/inativo).
  - Diálogo de configuração:
    - Listagem dos payloads recentes do webhook (indicando se são de teste ou produção).
    - Preview JSON formatado do payload selecionado (body + headers).
    - Editor de JSON de mapeamento de campos (`fieldMappings`) com validação básica (JSON válido).
  - Aba **Histórico**: lista paginada/limitada de payloads de todos os webhooks, com filtro por `processed` e por webhook.

### Integração com Planos e Usuários

- **Planos**: nesta primeira versão, o campo `planId` será tratado como **string livre** (ex.: código/nome do plano). A página poderá exibir esse campo e permitir edição em texto simples. No futuro, poderá ser integrado a um módulo de planos dedicado.
- **Status de usuário**: `userStatus` será armazenado no `Webhook` (`active` ou `expired`) e exposto na API, mas o ato de atualizar o status real do usuário continuará responsabilidade de outro serviço/rotina, que lerá `Webhook`, `WebhookPayload` e `fieldMappings`.

### Segurança e Acesso

- Todas as rotas admin de webhooks/payloads exigem `role=admin` via `get_current_admin`.
- A URL pública de webhook usa um `secret` opaco (UUID ou token aleatório) armazenado na tabela `webhooks` e **não adivinhável**.
- Não haverá autenticação adicional no endpoint público, assumindo que o `secret` é suficiente e que, em produção, será usado HTTPS.

