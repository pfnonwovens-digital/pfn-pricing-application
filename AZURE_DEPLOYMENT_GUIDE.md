# Azure Deployment Guide - Mini ERP

## ✅ Completed Steps
- [x] Git repository initialized
- [x] Code committed to Git
- [x] web.config created for Azure

## 🚀 Deploy to Azure (Portal Method)

### Step 1: Create Azure App Service

1. Go to [Azure Portal](https://portal.azure.com)
2. Click **"Create a resource"**
3. Search for **"Web App"** and click Create

### Step 2: Configure Web App

Fill in the following details:

**Basics Tab:**
- **Subscription**: Your free Azure subscription
- **Resource Group**: Create new → `mini-erp-test-rg`
- **Name**: `mini-erp-test-[your-initials]` (must be globally unique)
- **Publish**: Code
- **Runtime stack**: Node 18 LTS
- **Operating System**: Windows
 **Region**: East US (or closest to you)
- **Pricing Plan**: Free F1 (perfect for testing)

**Click "Review + Create"** then **"Create"**

### Step 3: Deploy Your Code

**Option A: GitHub Deployment (Recommended)**

1. Push your code to GitHub:
   ```powershell
   # Create a new repository on GitHub first, then:
   git remote add origin https://github.com/YOUR-USERNAME/mini-erp-node.git
   git branch -M main
   git push -u origin main
   ```

2. In Azure Portal, go to your Web App
3. In left menu, click **Deployment Center**
4. Select **GitHub** as source
5. Authorize and select your repository
6. Select branch: `main`
7. Click **Save**

**Option B: ZIP Deploy (Quickest)**

1. Create deployment package:
   ```powershell
   # In your project directory:
   Compress-Archive -Path * -DestinationPath mini-erp-deploy.zip -Force
   ```

2. In Azure Portal, go to your Web App
3. In left menu, click **Deployment Center**
4. Select **Local Git** or **ZIP Deploy**
5. Use Advanced Tools (Kudu) → `https://YOUR-APP-NAME.scm.azurewebsites.net/ZipDeployUI`
6. Drag and drop your `mini-erp-deploy.zip`

**Option C: VS Code Extension**

1. Install "Azure App Service" extension in VS Code
2. Sign in to Azure
3. Right-click on your Web App → Deploy to Web App
4. Select your project folder

### Step 4: Configure Application

1. In Azure Portal, go to your Web App
2. Click **Configuration** in left menu
3. Under **Application settings**, add if needed:
   - `WEBSITE_NODE_DEFAULT_VERSION`: `~18`
   - `SCM_DO_BUILD_DURING_DEPLOYMENT`: `true`

4. Click **Save**

### Step 5: Access Your Application

Your app will be available at:
```
https://YOUR-APP-NAME.azurewebsites.net
```

### Step 6: Monitor and Test

1. In Azure Portal, check **Log stream** for any errors
2. Test all features:
   - BOM Calculator
   - Products Editor
   - Data loading
   - Excel file operations

## 📊 Free Tier Limitations

- **60 minutes/day compute time**
- Always-on not available (app sleeps after 20 min idle)
- No custom domains
- Perfect for testing!

## 🔄 Update Your App

**If using GitHub deployment:**
- Just push changes to your GitHub repository
- Azure automatically redeploys

**If using ZIP deploy:**
- Create new ZIP file
- Upload via Kudu

## 🎯 Next Steps for Production

Once tested and approved:

1. **Migrate to corporate Azure account**
2. **Upgrade to Basic tier** (always-on, custom domains)
3. **Add custom domain**
4. **Enable SSL certificate**
5. **Set up Application Insights** for monitoring
6. **Configure backup and scaling**

## 🆘 Troubleshooting

**App not loading?**
- Check Log Stream in Azure Portal
- Verify Node version matches (18 LTS)
- Check web.config is deployed
- Ensure package.json has start script

**Files not updating?**
- Clear deployment cache in Kudu console
- Restart the Web App
- Check deployment logs

## 📞 Support

For issues, check:
1. Azure Portal → Your Web App → Diagnose and solve problems
2. Log stream for real-time errors
3. Application Insights for detailed telemetry

