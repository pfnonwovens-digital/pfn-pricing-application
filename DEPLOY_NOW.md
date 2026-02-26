# 🚀 QUICK START - Deploy Mini ERP to Azure

## ✅ What's Been Done

1. ✓ Git repository initialized and code committed
2. ✓ Azure configuration files created ([web.config](web.config))
3. ✓ Deployment package created (`mini-erp-deploy.zip` - 211 KB)
4. ✓ Deployment scripts and guides ready

## 🎯 Next Step: Choose Your Deployment Method

### Option 1: Azure Portal (Easiest - Recommended for First Time)

1. **Go to**: https://portal.azure.com
2. **Create Web App**:
   - Click "Create a resource" → "Web App"
   - Name: `mini-erp-test-[yourname]`
   - Runtime: **Node 18 LTS**
   - OS: **Windows**
   - Plan: **Free F1**
   - Click "Create"

3. **Deploy Your Code**:
   - In your Web App, open "Advanced Tools (Kudu)"
   - Go to: `https://YOUR-APP-NAME.scm.azurewebsites.net/ZipDeployUI`
   - Drag and drop `mini-erp-deploy.zip`
   - Wait for deployment to complete

4. **Access Your App**:
   - `https://YOUR-APP-NAME.azurewebsites.net`

📖 **Full guide**: See [AZURE_DEPLOYMENT_GUIDE.md](AZURE_DEPLOYMENT_GUIDE.md)

---

### Option 2: GitHub (Best for Continuous Deployment)

```powershell
# Create a repo on GitHub first, then:
git remote add origin https://github.com/YOUR-USERNAME/mini-erp-node.git
git branch -M main
git push -u origin main
```

Then in Azure Portal:
- Deployment Center → GitHub → Select your repo → Save

---

### Option 3: Azure CLI (Once Installed)

```powershell
# Run the automated script:
.\deploy-to-azure.ps1
```

**Note**: Azure CLI installation was attempted but needs manual completion.  
Download: https://aka.ms/installazurecliwindows

---

## 📦 Files in Your Project

| File | Purpose |
|------|---------|
| `mini-erp-deploy.zip` | Ready-to-upload deployment package |
| `web.config` | Azure/IIS configuration |
| `deploy-to-azure.ps1` | Automated deployment script (requires Azure CLI) |
| `AZURE_DEPLOYMENT_GUIDE.md` | Complete deployment documentation |
| `.git/` | Git repository (code is committed) |

---

## 🔍 Testing Checklist

Once deployed, test:
- [ ] Home page loads
- [ ] BOM Calculator works
- [ ] Products Editor opens
- [ ] Excel files load correctly
- [ ] Data displays properly

---

## 💡 Tips

- **First deployment takes 2-5 minutes** (Node.js installation + npm install)
- **Free tier has 60 min/day limit** - perfect for testing!
- **App sleeps after 20 min idle** - first request may be slow
- **Monitor in Azure Portal**: App Service → Log Stream

---

## 🆘 Need Help?

1. Check [AZURE_DEPLOYMENT_GUIDE.md](AZURE_DEPLOYMENT_GUIDE.md) for detailed steps
2. Check Azure Portal → Diagnose and solve problems
3. View logs: Portal → Your Web App → Log stream

---

## ✨ What's Next?

After testing successfully:
1. ✅ Test all features with generic data
2. Share URL with colleagues for feedback
3. Once approved, migrate to corporate Azure account
4. Upgrade to paid tier for production use
5. Add custom domain and SSL

---

**Ready to deploy? Start with Option 1 (Azure Portal) - it's the fastest way to get your app online! 🎉**
