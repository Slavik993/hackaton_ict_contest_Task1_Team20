# Инструкция по запуску

## Требования

- Node.js >= 20
- npm >= 10
- (Опционально) Docker + Docker Compose

---

## Локальный запуск (Node.js)

### 1. Установка зависимостей

```bash
npm install
```

### 2. Запуск сервера

```bash
npm start
```

Сервер запустится на `http://localhost:3000`

### 3. Режим разработки (с автоперезагрузкой)

```bash
npm run dev
```

Требует установленного `nodemon` (входит в devDependencies).

---

## Запуск через Docker

### 1. Сборка и запуск

```bash
docker-compose up --build
```

### 2. В фоновом режиме

```bash
docker-compose up -d --build
```

### 3. Остановка

```bash
docker-compose down
```

Порты:
- **3000** — основное приложение
- **3001** — (если настроено) дополнительный сервис

---

## Переменные окружения

Создайте файл `.env` в корне проекта (или используйте системные переменные):

```env
# Обязательные
JWT_SECRET=your-super-secret-key-change-in-production
NODE_ENV=development

# Опциональные (есть дефолты)
PORT=3000
DB_PATH=./data/platform.db
CATALOG_CSV=catalog_export_v4.csv
DATASETS_XLSX=Датасеты_хакатон.xlsx
MAX_FILE_SIZE=10485760
UPLOAD_DIR=public/uploads
```

---

## Инициализация базы данных

База данных инициализируется автоматически при первом запуске (`npm start` или `docker-compose up`).

Сид (`server/services/seed.js`) выполняет:
1. Создаёт таблицы
2. Загружает 6 отраслей и 7 типов объектов
3. Парсит `catalog_export_v4.csv` → 224 решения
4. Парсит `Датасеты_хакатон.xlsx` → параметры для каждого типа объекта
5. Создаёт демо-пользователей:
   - **admin@robplatform.local** / `admin123` (роль: admin)
   - **demo@robplatform.local** / `demo123` (роль: user)

### Принудительный ре-сид

```bash
npm run seed
```

---

## Демо-доступ

| Роль | Email | Пароль | Возможности |
|---|---|---|---|
| Администратор | `admin@robplatform.local` | `admin123` | Полный доступ: каталог, пользователи, параметры, импорт |
| Пользователь | `demo@robplatform.local` | `demo123` | Проекты, расчёты, визуализация, экспорт |
| Гость | — | — | Просмотр каталога, демо-расчёты (без сохранения) |

Также доступен **демо-вход в 1 клик** на странице логина (кнопки "Войти как пользователь" / "Войти как админ").

---

## Структура проекта

```
project/
├── server.js              # Точка входа сервера
├── config.js              # Конфигурация (JWT, порт, пути)
├── package.json           # Зависимости и скрипты
├── docker-compose.yml     # Docker конфигурация
├── Dockerfile             # Docker образ
├── render.yaml            # Render Blueprint (бесплатный хостинг)
├── index.html             # Главная страница (фронтенд)
├── app.js                 # Логика фронтенда (4 шага)
├── styles.css             # Стили
├── data.js                # Демо-данные для фронтенда
├── catalog_export_v4.csv  # Каталог решений (224 позиции)
├── Датасеты_хакатон.xlsx  # Параметры объектов
├── server/
│   ├── db.js              # SQLite подключение и инициализация
│   ├── middleware/auth.js # JWT аутентификация и авторизация
│   ├── routes/            # API маршруты
│   └── services/          # Бизнес-логика (seed, parser, calculation)
├── public/                # Статические файлы (видео, загрузки)
├── docs/                  # Документация
│   ├── architecture.md
│   └── api.md
├── SOLUTION.md            # Описание решения
├── ARCHITECTURE.md        # Архитектура (этот файл дублирует docs/architecture.md)
├── RUN.md                 # Эта инструкция
└── README.md              # Общее описание проекта
```

---

## Полезные команды

| Команда | Описание |
|---|---|
| `npm start` | Продакшн-запуск |
| `npm run dev` | Разработка с nodemon |
| `npm run seed` | Пересоздание БД и загрузка данных |
| `npm run generate-videos` | Генерация видео-демо (пуппитер) |
| `docker-compose up` | Запуск в контейнере |
| `docker-compose logs -f` | Логи контейнера |

---

## Типичные проблемы

### Порт 3000 занят
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :3000
kill -9 <PID>
```

### Ошибка better-sqlite3 при сборке
```bash
npm rebuild better-sqlite3
# или в Docker — уже настроено в Dockerfile
```

### База данных не создаётся
Проверьте права на запись в папку `data/` (локально) или рабочую директорию (на Render).

### Файлы каталога не найдены
Убедитесь, что `catalog_export_v4.csv` и `Датасеты_хакатон.xlsx` лежат в корне проекта.

---

## Деплой на Render (бесплатно)

1. Форкните/запушьте репозиторий на GitHub
2. Зайдите на https://dashboard.render.com
3. **New → Blueprint**
4. Подключите репозиторий
5. Render найдёт `render.yaml` и создаст:
   - Web Service (Node.js, free tier)
   - Health check на `/api/health`
   - Auto-deploy при пуше в main
6. URL будет вида `https://robo-visual.onrender.com`

**Важно**: на бесплатном тарифе нет персистентного диска — БД пересоздаётся при каждом деплое (сид запускается автоматически).

---

## Проверка работоспособности

```bash
# Health check
curl http://localhost:3000/api/health

# Ожидаемый ответ
{"status":"ok","timestamp":"2026-09-23T..."}
```

Откройте `http://localhost:3000` в браузере — должен загрузиться 4-шаговый мастер.