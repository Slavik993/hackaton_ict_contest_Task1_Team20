# API Документация

Базовый URL: `http://localhost:3000/api`

## Аутентификация

### POST /api/auth/login

Авторизация пользователя.

**Тело запроса:**
```json
{ "email": "demo@robplatform.local", "password": "demo123" }
```

**Ответ:**
```json
{ "token": "eyJhbG...", "user": { "id": 2, "email": "...", "role": "user" } }
```

### POST /api/auth/register

Регистрация нового пользователя.

### POST /api/auth/demo-login

Демо-вход (user или admin).

**Тело запроса:**
```json
{ "role": "user" }
```

### POST /api/auth/guest

Вход как гость (без сохранения данных).

### POST /api/auth/logout

Выход (клиентская функция, токен удаляется).

## Каталог

### GET /api/catalog

Получить все отрасли, типы объектов и типы решений.

**Ответ:**
```json
{
  "industries": [{ "id": "trade", "name": "Торговля", ... }],
  "solutionTypes": [{ "id": "mobile", ... }]
}
```

### GET /api/catalog/solutions

Поиск решений с фильтрацией.

**Параметры query:**
- `object_type` — тип объекта (warehouse, airport, medical, ...)
- `type` — тип решения (mobile, agv, sorting, ...)
- `search` — поиск по названию/вендору
- `min_fit` — минимальный процент совпадения
- `limit` — лимит (по умолчанию 50)
- `offset` — смещение

### GET /api/catalog/solutions/:id

Получить решение по ID.

### GET /api/catalog/solution-types

Типы решений с подсчётом решений каждого типа.

## Расчёт экономики

### POST /api/calculation

Расчёт экономики для выбранного решения.

**Тело запроса:**
```json
{
  "params": { "area": 8000, "operations": 18000, "staff": 60, ... },
  "solution": { ... },
  "model": "purchase"
}
```

**Ответ:**
```json
{
  "baseScenario": { ... },
  "purchaseScenario": {
    "totalCapex": 3800000,
    "totalAnnualOpex": 480000,
    "annualSavings": 1200000,
    "netAnnualEffect": 720000,
    "payback": 3.2,
    "roi": 63.2,
    "robotCount": 2,
    ...
  },
  "raasScenario": { ... },
  "sensitivity": { ... }
}
```

### POST /api/calculation/scenarios

Расчёт нескольких сценариев одновременно.

**Тело запроса:**
```json
{
  "params": { ... },
  "solutions": [{ ... }, { ... }]
}
```

### POST /api/calculation/export/pdf

Экспорт результатов в PDF (POST с body: `{ params, solution }`).

### POST /api/calculation/export/excel

Экспорт результатов в Excel (POST с body: `{ params, solution }`).

## Проекты

Все проекты требуют авторизации (JWT в `Authorization: Bearer <token>`).

### GET /api/projects

Список проектов текущего пользователя.

### POST /api/projects

Создание проекта.

**Тело:** `{ "name": "Мой проект", "data": { ... } }`

### GET /api/projects/:id

Получить проект.

### PUT /api/projects/:id

Обновить проект.

### DELETE /api/projects/:id

Удалить проект.

### POST /api/projects/:id/duplicate

Копировать проект.

## Администрирование

### GET /api/admin/solutions

Список всех решений (только admin).

### POST /api/admin/solutions

Добавить/обновить решение (только admin).

### DELETE /api/admin/solutions/:id

Удалить решение (только admin).

### GET /api/admin/sources/all

Источники каталога (только admin).

## Экспорт и импорт

### POST /api/export/pdf

Экспорт расчёта в PDF.

### POST /api/export/excel

Экспорт расчёта в Excel.

### POST /api/import/catalog

Загрузка файла каталога (CSV/XLSX). Требуется авторизация.

**FormData:**
- `file` — файл (.csv, .xlsx, .xls, .pdf, .json)

## Здоровье

### GET /api/health

Проверка состояния сервера.

## Авторизация

Для всех защищённых эндпоинтов передавайте токен в заголовке:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6...
```

Токен получен через `/api/auth/login` или `/api/auth/demo-login`.
