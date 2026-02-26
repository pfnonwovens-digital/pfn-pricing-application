# Migration Checklist: Test → Corporate Azure

## 📋 Pre-Migration Checklist

### ✅ Before You Start
- [ ] Test all features in trial version
- [ ] Gather feedback from colleagues
- [ ] Update Excel data files with production data (if needed)
- [ ] Create new deployment ZIP with latest code
- [ ] Have corporate Azure account credentials ready
- [ ] Confirm corporate Azure subscription has quota for new Web App

---

## 🚀 Migration Steps (20-30 minutes)

### Step 1: Prepare Deployment Package (5 min)

On your PC:
```powershell
cd 'c:\Users\mfischer\OneDrive - PFNonwovens LLC\Desktop\mini-erp-node'

# Update any data files first if needed
# Then create fresh deployment ZIP
Compress-Archive -Path server.js,package.json,package-lock.json,web.config,src,data -DestinationPath mini-erp-production.zip -Force
```

- [ ] Fresh ZIP created with latest code
- [ ] ZIP file size verified (~200-250 KB)
- [ ] Production data files included in `/data` folder

---

### Step 2: Create Web App in Corporate Azure (10 min)

1. **Login to Azure Portal** (portal.azure.com)
   - [ ] Use corporate Azure account credentials
   - [ ] Select corporate subscription

2. **Create Resource Group** (recommended)
   - [ ] Click "Create a resource"
   - [ ] Search for "Resource group"
   - [ ] Name: `mini-erp-production-rg` (or your naming convention)
   - [ ] Region: Select closest to users (e.g., Poland Central, West Europe)
   - [ ] Click "Review + Create" → "Create"

3. **Create Web App**
   - [ ] Click "Create a resource" → "Web App"
   - [ ] **Subscription**: Corporate subscription
   - [ ] **Resource Group**: mini-erp-production-rg
   - [ ] **Name**: `mini-erp-pfn` (or your preferred name - must be globally unique)
   - [ ] **Publish**: Code
   - [ ] **Runtime stack**: Node 20 LTS
   - [ ] **Operating System**: Windows
   - [ ] **Region**: Same as resource group
   - [ ] **Pricing Plan**: 
     - Start with **Basic B1** ($13/month) - recommended for production
     - OR **Free F1** temporarily to test, then upgrade
   - [ ] Click "Review + Create" → "Create"
   - [ ] Wait for deployment (1-2 minutes)
   - [ ] Note your app URL: `https://mini-erp-pfn.azurewebsites.net` (or similar)

---

### Step 3: Configure Application Settings (5 min)

1. **Open your new Web App**
   - [ ] Go to Azure Portal → Your Web App

2. **Add Application Settings**
   - [ ] Left menu → Settings → **Environment variables**
   - [ ] Click **App settings** tab
   - [ ] Click **+ Add**
   
   **Setting 1:**
   - [ ] Name: `SCM_DO_BUILD_DURING_DEPLOYMENT`
   - [ ] Value: `true`
   - [ ] Deployment slot setting: unchecked
   
   **Setting 2:**
   - [ ] Name: `WEBSITE_NODE_DEFAULT_VERSION`
   - [ ] Value: `~20`
   - [ ] Deployment slot setting: unchecked
   
   - [ ] Click **Save**
   - [ ] Overview → Click **Restart**

---

### Step 4: Deploy Application (5 min)

1. **Open Kudu (Advanced Tools)**
   - [ ] Web App → Settings → Advanced Tools
   - [ ] Click "Go →"
   - [ ] Note Kudu URL: `https://YOUR-APP-NAME.scm.azurewebsites.net/`

2. **Deploy via ZIP**
   - [ ] Navigate to: `https://YOUR-APP-NAME.scm.azurewebsites.net/ZipDeployUI`
   - [ ] Drag and drop `mini-erp-production.zip`
   - [ ] Wait for "Deploying..." to complete (30-60 seconds)
   - [ ] Look for success message

3. **Wait for Build**
   - [ ] First deployment takes 2-5 minutes (npm install runs)
   - [ ] Monitor in Kudu or Log Stream

---

### Step 5: Verify Deployment (5 min)

Test these URLs:

1. **Health Check**
   - [ ] Open: `https://YOUR-APP-NAME.azurewebsites.net/api/health`
   - [ ] Expected: `{"status":"ok","timestamp":"..."}`

2. **Home Page**
   - [ ] Open: `https://YOUR-APP-NAME.azurewebsites.net/`
   - [ ] Expected: PFN logo and navigation menu

3. **API Metadata**
   - [ ] Open: `https://YOUR-APP-NAME.azurewebsites.net/api/metadata`
   - [ ] Expected: JSON with sapIds, pfnIds, customers, etc.

4. **BOM Calculator**
   - [ ] Open: `https://YOUR-APP-NAME.azurewebsites.net/bom-calculator.html`
   - [ ] Test dropdown lists load
   - [ ] Test calculation works

5. **Products Editor**
   - [ ] Open: `https://YOUR-APP-NAME.azurewebsites.net/products-editor.html`
   - [ ] Test search works
   - [ ] Test edit functionality

---

## 🔒 Optional: Production Enhancements (30-60 min)

### Custom Domain (if you have one)
- [ ] Azure Portal → Web App → Custom domains
- [ ] Add domain (e.g., `erp.pfnonwovens.com`)
- [ ] Update DNS records at domain registrar
- [ ] Wait for DNS propagation (5-60 minutes)
- [ ] Verify domain ownership

### SSL Certificate
- [ ] After custom domain added
- [ ] TLS/SSL settings → Add certificate
- [ ] Use free Azure Managed Certificate
- [ ] Enable HTTPS only

### Application Insights (Monitoring)
- [ ] Create Application Insights resource
- [ ] Link to Web App
- [ ] Monitor performance, errors, usage
- [ ] Set up alerts for failures

### Always-On (for Basic tier+)
- [ ] Configuration → General settings
- [ ] Always On: **On**
- [ ] Save

### Backup Configuration (for Basic tier+)
- [ ] Backups → Configure
- [ ] Set schedule (daily recommended)
- [ ] Choose storage account

---

## 📊 Post-Migration Tasks

### Share with Team
- [ ] Send new production URL to colleagues
- [ ] Update any bookmarks/shortcuts
- [ ] Update documentation with new URL

### Monitor for 24-48 Hours
- [ ] Check Log Stream for errors
- [ ] Monitor performance
- [ ] Gather user feedback
- [ ] Watch Azure costs (should be $0-13/month)

### Clean Up Test Resources (optional)
- [ ] Keep test environment for future testing, OR
- [ ] Delete test resource group to avoid charges:
  ```
  Azure Portal → Resource Groups → mini-erp-test-rg → Delete
  ```

---

## 🆘 Troubleshooting

### If App Shows 500 Error
1. Check Log Stream: Web App → Log stream
2. Look for "Cannot find module" errors
3. Verify app settings are correct
4. Restart the app
5. Redeploy ZIP if needed

### If App is Slow
1. Upgrade from Free to Basic tier
2. Enable Always-On
3. Check Application Insights for bottlenecks

### If Data is Missing
1. Verify Excel files are in the ZIP
2. Check `/data` folder in Kudu → Debug Console → CMD
3. Verify file paths in code

---

## 📞 Support Contacts

**Azure Support**: portal.azure.com → Help + support
**Internal IT**: [Add your corporate IT contact]

---

## 🎯 Success Criteria

✅ Migration is complete when:
- [ ] All 5 test URLs work correctly
- [ ] Colleagues can access and use the app
- [ ] No errors in Log Stream
- [ ] Performance is acceptable
- [ ] Production data is visible

---

## 📝 Notes Section

**Migration Date**: _______________
**App Name**: _______________
**App URL**: _______________
**Kudu URL**: _______________
**Pricing Tier**: _______________
**Performed By**: _______________

**Issues Encountered**:


**Time Taken**: _______________

---

## 🔄 Future Updates

After migration, to push updates:

### Option 1: ZIP Deploy
```powershell
# Update code/data, then:
Compress-Archive -Path server.js,package.json,package-lock.json,web.config,src,data -DestinationPath mini-erp-update.zip -Force
# Upload to Kudu ZipDeployUI
```

### Option 2: GitHub (recommended)
- Set up GitHub repository
- Connect Azure Deployment Center to GitHub
- Future updates: just `git push`
