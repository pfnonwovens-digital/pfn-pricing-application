# Azure Deployment Script for Mini ERP
# Run this script after Azure CLI is installed and configured

param(
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroup = "mini-erp-test-rg",
    
    [Parameter(Mandatory=$false)]
    [string]$Location = "eastus",
    
    [Parameter(Mandatory=$false)]
    [string]$AppServicePlan = "mini-erp-plan",
    
    [Parameter(Mandatory=$false)]
    [string]$WebAppName = "mini-erp-$( Get-Random -Minimum 1000 -Maximum 9999)"
)

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Mini ERP Azure Deployment Script" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if Azure CLI is installed
Write-Host "Checking Azure CLI..." -ForegroundColor Yellow
try {
    $azVersion = az --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Azure CLI is installed" -ForegroundColor Green
    } else {
        throw "Azure CLI not found"
    }
} catch {
    Write-Host "✗ Azure CLI is not installed or not in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Azure CLI first:" -ForegroundColor Yellow
    Write-Host "https://aka.ms/installazurecliwindows" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Or use the manual deployment method in AZURE_DEPLOYMENT_GUIDE.md" -ForegroundColor Yellow
    exit 1
}

# Login to Azure
Write-Host ""
Write-Host "Logging in to Azure..." -ForegroundColor Yellow
az login --output none
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Azure login failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Logged in to Azure" -ForegroundColor Green

# Create Resource Group
Write-Host ""
Write-Host "Creating resource group: $ResourceGroup" -ForegroundColor Yellow
az group create --name $ResourceGroup --location $Location --output none
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Resource group created" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to create resource group" -ForegroundColor Red
    exit 1
}

# Create App Service Plan (Free Tier)
Write-Host ""
Write-Host "Creating App Service Plan: $AppServicePlan" -ForegroundColor Yellow
az appservice plan create `
    --name $AppServicePlan `
    --resource-group $ResourceGroup `
    --sku FREE `
    --output none

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ App Service Plan created (Free Tier)" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to create App Service Plan" -ForegroundColor Red
    exit 1
}

# Create Web App
Write-Host ""
Write-Host "Creating Web App: $WebAppName" -ForegroundColor Yellow
az webapp create `
    --name $WebAppName `
    --resource-group $ResourceGroup `
    --plan $AppServicePlan `
    --runtime "NODE:18-lts" `
    --output none

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Web App created" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to create Web App" -ForegroundColor Red
    exit 1
}

# Configure deployment
Write-Host ""
Write-Host "Configuring deployment..." -ForegroundColor Yellow
az webapp config appsettings set `
    --name $WebAppName `
    --resource-group $ResourceGroup `
    --settings WEBSITE_NODE_DEFAULT_VERSION="~18" SCM_DO_BUILD_DURING_DEPLOYMENT="true" `
    --output none

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Configuration updated" -ForegroundColor Green
}

# Deploy using ZIP
if (Test-Path "mini-erp-deploy.zip") {
    Write-Host ""
    Write-Host "Deploying application..." -ForegroundColor Yellow
    az webapp deployment source config-zip `
        --name $WebAppName `
        --resource-group $ResourceGroup `
        --src mini-erp-deploy.zip `
        --output none
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Application deployed" -ForegroundColor Green
    } else {
        Write-Host "! Deployment may have issues - check Azure Portal" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "! Deployment package not found. Creating it now..." -ForegroundColor Yellow
    Compress-Archive -Path server.js,package.json,package-lock.json,web.config,src,data `
        -DestinationPath mini-erp-deploy.zip -Force
    
    Write-Host "Deploying application..." -ForegroundColor Yellow
    az webapp deployment source config-zip `
        --name $WebAppName `
        --resource-group $ResourceGroup `
        --src mini-erp-deploy.zip `
        --output none
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Application deployed" -ForegroundColor Green
    }
}

# Display results
Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your application is available at:" -ForegroundColor Yellow
Write-Host "https://$WebAppName.azurewebsites.net" -ForegroundColor Cyan
Write-Host ""
Write-Host "Resource Details:" -ForegroundColor Yellow
Write-Host "  Resource Group: $ResourceGroup" -ForegroundColor White
Write-Host "  App Service Plan: $AppServicePlan" -ForegroundColor White
Write-Host "  Web App Name: $WebAppName" -ForegroundColor White
Write-Host "  Location: $Location" -ForegroundColor White
Write-Host ""
Write-Host "To view logs:" -ForegroundColor Yellow
Write-Host "  az webapp log tail --name $WebAppName --resource-group $ResourceGroup" -ForegroundColor Cyan
Write-Host ""
Write-Host "To open in browser:" -ForegroundColor Yellow
Write-Host "  start https://$WebAppName.azurewebsites.net" -ForegroundColor Cyan
Write-Host ""

# Save deployment info
$deploymentInfo = @"
Deployment Information
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

Resource Group: $ResourceGroup
App Service Plan: $AppServicePlan
Web App Name: $WebAppName
Location: $Location
URL: https://$WebAppName.azurewebsites.net

To delete these resources:
  az group delete --name $ResourceGroup --yes --no-wait
"@

$deploymentInfo | Out-File -FilePath "azure-deployment-info.txt" -Encoding UTF8
Write-Host "Deployment info saved to: azure-deployment-info.txt" -ForegroundColor Green
Write-Host ""
