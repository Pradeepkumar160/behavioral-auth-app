# 🚀 BioAuth – Run Instructions (Windows PowerShell)

## Prerequisites
- **Node.js 20+** → https://nodejs.org  (LTS version)
- **pnpm** → run: `npm install -g pnpm`

## Steps to Run

Open **PowerShell** and run these commands:

```powershell
# 1. Go to the project folder
cd "D:\000 PROJECTS\behavioral_auth_app_COMPLETE\behavioral_auth_app"

# 2. Install dependencies (only needed once)
pnpm install

# 3. Start the development server
pnpm dev
```

Then open your browser at: **http://localhost:3000**

---

## That's it! No database required for basic use.

The app runs fully without MySQL. Data resets when you restart the server.

---

## Optional: Add MySQL for Persistent Storage

1. Install MySQL 8 and create a database:
   ```sql
   CREATE DATABASE bioauth;
   ```

2. Edit `.env` and set your connection string:
   ```
   DATABASE_URL=mysql://root:yourpassword@localhost:3306/bioauth
   ```

3. Run the database migration:
   ```powershell
   pnpm db:push
   ```

4. Start the server: `pnpm dev`

---

## Making Yourself Admin (requires MySQL)

1. Register an account at http://localhost:3000/register
2. In MySQL run:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
   ```
3. Log out and log back in → you'll see the Admin panel

---

## Features
| Feature | Description |
|---------|-------------|
| 🔐 Login / Register | Local email + password auth |
| ⌨️ Keystroke Dynamics | Hold time & flight time (no characters stored) |
| 🖱️ Mouse Dynamics | Speed, distance, acceleration |
| 📊 Live Risk Chart | Real-time anomaly score graph |
| ⚠️ Re-auth Modal | Triggers when risk level hits HIGH |
| 🛡️ Admin Panel | View all sessions, terminate them, see behavior logs |
| 🧠 Profile Training | 5 batches to build your behavioral baseline |

