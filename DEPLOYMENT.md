# Deployment Guide

## Local Development

### Prerequisites
- Node.js 14+ ([download](https://nodejs.org/))
- npm (included with Node.js)

### Setup (5 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Create test admin user
node scripts/setup.js

# 3. Start development server
npm start

# 4. Access at http://localhost:3000/login.html
```

Test credentials:
- Email: `testuser@pfnonwovens.com`
- Password: `TestPass123`

### Development Workflow

```bash
# Start server (runs on port 3000)
npm start

# Server reloads automatically on file changes
# Access: http://localhost:3000

# Create additional users
node scripts/seed-admin.js  # Interactive user creation

# Reset database
Remove-Item data/mini_erp.db
node scripts/setup.js
npm start
```

---

## Azure Web App Deployment

### Method 1: GitHub + Automatic Deployment (Recommended)

**Setup Time**: 10 minutes | **Best For**: Continuous deployment

#### Step 1: Create GitHub Repository

```bash
cd mini-erp-node
git init
git add .
git commit -m "Initial commit"
git branch -M main

# On GitHub: Create new repo "mini-erp-node"
git remote add origin https://github.com/YOUR-USERNAME/mini-erp-node.git
git push -u origin main
```

#### Step 2: Create Azure Web App

1. Go to [Azure Portal](https://portal.azure.com)
2. Click "Create a resource" → "Web App"
3. Fill in:
   - **Subscription**: Your subscription
   - **Resource Group**: Create new or select existing
   - **Name**: `mini-erp-prod` (or your preferred name)
   - **Publish**: Code
   - **Runtime Stack**: Node 18 LTS
   - **Operating System**: Windows
   - **App Service Plan**: Create new
     - **Sku and size**: Free F1 (for testing) or Standard S1 (production)
4. Click "Create"

#### Step 3: Configure Automatic Deployment

1. In Azure Portal, go to your Web App
2. Left sidebar → **Deployment Center**
3. **Source**: GitHub
4. **Sign in to GitHub** when prompted
5. **Organization**: Select your GitHub account
6. **Repository**: `mini-erp-node`
7. **Branch**: `main`
8. Click **Save**

#### Step 4: Deploy

```bash
# Any push to main branch now auto-deploys
git commit -m "Update feature"
git push origin main

# Azure automatically:
# - Pulls code from GitHub
# - Runs npm install
# - Starts the application
```

**Monitor deployment**:
- Azure Portal → Deployment Center → Deployments tab
- Real-time build logs available

#### Step 5: Access Application

```
https://mini-erp-prod.azurewebsites.net
```

---

### Method 2: Direct Azure Portal Upload (Simple One-Time Deploy)

**Setup Time**: 5 minutes | **Best For**: Quick testing

#### Step 1: Create Web App

1. Azure Portal → Create a resource → Web App
2. Same settings as Method 1 (Steps 1-3 above)

#### Step 2: Prepare Deployment Package

```bash
# Zip your code (exclude node_modules)
# On Windows:
Compress-Archive -Path . -DestinationPath deployment.zip `
  -Exclude node_modules, .git, data/mini_erp.db
```

#### Step 3: Upload Package

1. Azure Portal → Your Web App
2. Left sidebar → **Advanced Tools** → **Go** (opens Kudu)
3. **Zip Push Deploy** section
4. Drag & drop `deployment.zip` file
5. Wait for deployment

#### Step 4: Verify

```
https://YOUR-APP-NAME.azurewebsites.net/api/health
```

Should return:
```json
{"status":"ok","timestamp":"..."}
```

---

### Method 3: Azure CLI (For Automation)

**Setup Time**: 5 minutes | **Best For**: Teams with CLI experience

```bash
# Prerequisites: Azure CLI installed
# https://docs.microsoft.com/cli/azure/install-azure-cli

# 1. Login to Azure
az login

# 2. Create resource group
az group create --name mini-erp-rg --location eastus

# 3. Create App Service plan
az appservice plan create --name mini-erp-plan \
  --resource-group mini-erp-rg --sku F1 --is-linux

# 4. Create Web App
az webapp create --resource-group mini-erp-rg \
  --plan mini-erp-plan --name mini-erp-prod \
  --runtime "node|18-lts"

# 5. Deploy code
cd mini-erp-node
az webapp up --resource-group mini-erp-rg \
  --name mini-erp-prod

# Application is now live at: https://mini-erp-prod.azurewebsites.net
```

---

## Environment Configuration

### Production Environment Variables

```bash
# Azure Portal → Your Web App → Configuration → Application settings

NODE_ENV=production
JWT_SECRET=your-very-secret-key-change-this
PORT=80
```

**Important**: Change `JWT_SECRET` before deploying to production!

```powershell
# Generate secure random JWT secret
$randomBytes = [System.Text.Encoding]::UTF8.GetBytes((New-Guid).ToString());
[Convert]::ToBase64String($randomBytes)
```

### Application Settings in Azure Portal

1. Azure Portal → Your Web App
2. Left sidebar → **Configuration**
3. **Application settings** tab
4. Click **+ New application setting**
5. Add settings:
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = `your-secret-key`

---

## Security Checklist

### Before Production Deployment

- [ ] Change `JWT_SECRET` to random secure value
- [ ] Enable HTTPS only (Configuration → TLS/SSL settings)
- [ ] Set up database backups
- [ ] Review CORS settings if needed
- [ ] Enable Application Insights for monitoring
- [ ] Configure scaling rules
- [ ] Set up custom domain (if applicable)
- [ ] Enable authentication (Azure Active Directory)
- [ ] Review access logs

### Azure Security Best Practices

1. **Enable Managed Identity**
   - Configuration → Identity → Status: ON
   - This removes need for connection string secrets

2. **Use Key Vault for Secrets**
   - Azure Key Vault → Create new vault
   - Store `JWT_SECRET` there
   - Reference from Web App settings

3. **Set Network Restrictions**
   - Configuration → Access restrictions
   - Allow specific IP ranges if needed

4. **Enable Monitoring**
   - Application Insights → Enable
   - Monitors errors, performance, availability

---

## Database Persistence on Azure

By default, SQLite database (`data/mini_erp.db`) is stored locally and **will be lost when App Service restarts**.

### Option 1: Azure SQL Database (Recommended)

For permanent data storage:

1. Create Azure SQL Database
2. Update `src/backend/auth.js` to connect to Azure SQL
3. Benefits: Automatic backups, high availability, scalable

### Option 2: Azure Files (Simple)

For file-based storage:

1. Create Storage Account
2. Create File Share
3. Mount to Web App (Configuration → Path mappings)
4. SQLite database persists

### Option 3: Ephemeral (For Testing)

For testing only:
- Database recreates on each restart
- Run `node scripts/setup.js` after each restart
- Acceptable for demos/testing

---

## Troubleshooting Deployment

### Build Fails: "Cannot find module"

**Solution**: All dependencies must be in `package.json`
```bash
npm install bcrypt jsonwebtoken sqlite3 uuid
git add package.json package-lock.json
git commit -m "Add dependencies"
git push
```

### Application Won't Start

**Check logs**:
1. Azure Portal → Your Web App
2. Left sidebar → **Log stream**
3. Look for error messages

**Common issues**:
- Missing environment variables
- Port binding error
- Missing database file

### Database Lost After Restart

**Expected on Azure Free tier** - use Option 1 or 2 above for persistence

### High Memory/CPU Usage

1. Check for infinite loops: Review recent code changes
2. Monitor with Application Insights
3. Scale up App Service Plan if needed

---

## Monitoring & Maintenance

### View Application Logs

**Real-time logs**:
```bash
# Azure Portal → Your Web App → Log stream
```

**SSH into Web App**:
```bash
# Azure Portal → Your Web App → SSH (Kudu)
```

### Performance Monitoring

1. Azure Portal → Your Web App → Application Insights
2. View:
   - Response times
   - Failed requests
   - Server exceptions
   - Availability tests

### Scaling

**Vertical Scaling** (increase power):
- Configuration → App Service Plan
- Click plan name → Scale up
- Choose larger size

**Horizontal Scaling** (more instances):
- Configuration → Scale out
- Set minimum/maximum instance count
- Configure scaling rules

---

## Backup & Disaster Recovery

### Manual Backup

```bash
# Download database
az webapp deployment source config-zip --resource-group mini-erp-rg \
  --name mini-erp-prod --src backup.zip
```

### Automated Backup

1. Azure Portal → Your Web App
2. Left sidebar → **Backups**
3. Click **+ Add backup**
4. Configure backup schedule
5. Storage account required

---

## Rollback to Previous Version

If deployment breaks:

### Option 1: GitHub Revert
```bash
git revert HEAD
git push origin main
# Azure auto-redeploys previous version
```

### Option 2: Azure Portal
1. Azure Portal → Your Web App → Deployment slots
2. Select previous deployment
3. Click "Swap"

---

## Cost Estimation

| Component | Free Tier | Production |
|-----------|-----------|------------|
| Web App (F1) | $0/month | $13/month |
| App Service (S1) | — | $51/month |
| SQL Database (S0) | — | $15/month |
| Storage Account | $0.024/GB | $0.024/GB |
| **Total** | **~$0** | **~$80/month** |

### Cost Optimization

- Use Free F1 tier for testing
- Standard S1 for production (2GB/10GB)
- Enable Auto-shutdown for dev/test
- Use consumption-based pricing

---

## Support

For deployment issues:

1. **Check Azure Portal logs** → Log stream
2. **Review Application Insights** → Exceptions
3. **Check GitHub Actions** → Workflow logs
4. **Test locally first** → `npm start`

## Next Steps

- ✅ Deploy to Azure
- [ ] Configure custom domain
- [ ] Set up SSL certificate
- [ ] Configure Auto-scaling
- [ ] Set up monitoring alerts
- [ ] Plan database migration
- [ ] Document runbook

