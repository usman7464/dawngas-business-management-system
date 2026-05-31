const http = require("http");

const base = `http://localhost:${process.env.PORT || 3000}`;

function request(method, path, body, cookie = "") {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const req = http.request(
      `${base}${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Cookie: cookie
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const setCookie = res.headers["set-cookie"]
            ? res.headers["set-cookie"].map((item) => item.split(";")[0]).join("; ")
            : cookie;
          let bodyData = {};
          if (data) {
            try {
              bodyData = JSON.parse(data);
            } catch {
              bodyData = data;
            }
          }
          resolve({
            status: res.statusCode,
            cookie: setCookie,
            body: bodyData
          });
        });
      }
    );
    req.on("error", reject);
    req.end(payload);
  });
}

(async () => {
  const health = await request("GET", "/api/health");
  if (!health.body.success) throw new Error("Health check failed.");
  let owner = await request("GET", "/api/auth/owner-exists");
  let cookie = "";
  const email = "owner@dawngas.local";
  const password = "DawnGas123";
  if (!owner.body.exists) {
    const signup = await request("POST", "/api/auth/signup", { name: "DawnGas Owner", email, phone: "+92 300 0000000", password });
    if (!signup.body.success) throw new Error(`Signup failed: ${signup.body.message}`);
    cookie = signup.cookie;
    const secondSignup = await request("POST", "/api/auth/signup", { name: "Second Owner", email: "second@dawngas.local", phone: "+92 300 1111111", password });
    if (secondSignup.status !== 409) throw new Error("Owner-only signup rule failed.");
  } else {
    const login = await request("POST", "/api/auth/login", { email, password });
    if (!login.body.success) throw new Error("Login failed for existing smoke owner.");
    cookie = login.cookie;
  }

  const profile = await request("PATCH", "/api/profile", { name: "DawnGas Smoke Owner", email: "smoke-owner@dawngas.local", phone: "+92 300 0000001" }, cookie);
  if (!profile.body.success || profile.body.profile.email !== "smoke-owner@dawngas.local") throw new Error("Profile email update failed.");

  const categories = await request("GET", "/api/categories", null, cookie);
  if (!categories.body.success || !categories.body.categories.length) throw new Error("Default categories failed.");
  const categoryBy = (type, name) => categories.body.categories.find((item) => item.type === type && item.name === name)?.id;

  const itemTypes = await request("GET", "/api/item-types", null, cookie);
  if (!itemTypes.body.success || !itemTypes.body.itemTypes.find((item) => item.value === "FINISHED_PRODUCT" && item.canHaveBillOfMaterials)) throw new Error("Item type behavior defaults failed.");

  const storageLocation = await request("POST", "/api/master-data/storage-locations", { label: "Smoke Store", value: "smoke_store", code: "SMK", isDefault: true }, cookie);
  if (!storageLocation.body.success || !storageLocation.body.item.isDefault) throw new Error("Storage location master data failed.");

  const customUnit = await request("POST", "/api/master-data/units", { label: "bundle", value: "bundle", symbol: "bdl" }, cookie);
  if (!customUnit.body.success || customUnit.body.item.value !== "bundle") throw new Error("Unit master data failed.");

  const skuSuggestion = await request("GET", `/api/products/sku/suggest?itemType=FINISHED_PRODUCT&categoryId=${categoryBy("FINISHED_PRODUCT", "Stove")}`, null, cookie);
  if (!skuSuggestion.body.success || !skuSuggestion.body.sku.startsWith("STV-")) throw new Error("SKU suggestion failed.");

  const rawMaterial = await request(
    "POST",
    "/api/products",
    {
      itemType: "RAW_MATERIAL",
      categoryId: categoryBy("RAW_MATERIAL", "Metal"),
      name: "Smoke Test Metal Sheet",
      sku: `RAW-${Date.now()}`,
      unitOfMeasure: "bundle",
      costPrice: 1200,
      openingStockQuantity: 30,
      storageLocation: "smoke_store",
      lowStockThreshold: 5
    },
    cookie
  );
  if (!rawMaterial.body.success || !rawMaterial.body.product.stock) throw new Error("Raw material creation failed.");

  const finishedProduct = await request(
    "POST",
    "/api/products",
    {
      itemType: "FINISHED_PRODUCT",
      categoryId: categoryBy("FINISHED_PRODUCT", "Stove"),
      name: "Smoke Test 2 Burner Stove",
      sku: `STV-${Date.now()}`,
      unitOfMeasure: "piece",
      costPrice: 2500,
      sellingPrice: 4200,
      openingStockQuantity: 4,
      lowStockThreshold: 2,
      canBeProduced: true,
      hasBillOfMaterials: true,
      bom: [{ rawMaterialId: rawMaterial.body.product.id, quantityRequired: 1, unitOfMeasure: "sheet" }]
    },
    cookie
  );
  if (!finishedProduct.body.success || !finishedProduct.body.product.bom.length) throw new Error("Finished product creation or BOM failed.");

  const bomRead = await request("GET", `/api/products/${finishedProduct.body.product.id}/bom`, null, cookie);
  if (!bomRead.body.success || !bomRead.body.billOfMaterials.length) throw new Error("BOM read failed.");

  const bomPatch = await request(
    "PATCH",
    `/api/products/${finishedProduct.body.product.id}/bom`,
    { bom: [{ rawMaterialId: rawMaterial.body.product.id, quantityRequired: 2, unitOfMeasure: "bundle", wastagePercentage: 3 }] },
    cookie
  );
  if (!bomPatch.body.success || bomPatch.body.billOfMaterials[0].quantityRequired !== 2) throw new Error("BOM patch failed.");

  const service = await request(
    "POST",
    "/api/products",
    {
      itemType: "SERVICE",
      categoryId: categoryBy("SERVICE", "Installation"),
      name: "Smoke Test Installation",
      sku: `SRV-${Date.now()}`,
      standardServiceCharge: 1500
    },
    cookie
  );
  if (!service.body.success || service.body.product.stock) throw new Error("Service should not create inventory.");

  const invoiceSelect = await request("GET", "/api/products/invoice-select", null, cookie);
  if (!invoiceSelect.body.success || invoiceSelect.body.products.some((product) => product.id === rawMaterial.body.product.id)) throw new Error("Invoice product selector included raw material without direct sale.");

  const purchaseSelect = await request("GET", "/api/products/purchase-select", null, cookie);
  if (!purchaseSelect.body.success || purchaseSelect.body.products.some((product) => product.id === service.body.product.id)) throw new Error("Purchase product selector included service.");

  const productionComponents = await request("GET", "/api/products/production-components", null, cookie);
  if (!productionComponents.body.success || !productionComponents.body.products.some((product) => product.id === rawMaterial.body.product.id)) throw new Error("Production component selector failed.");

  const customer = await request(
    "POST",
    "/api/customers",
    { name: "Rafiq Autos Workshop", phone: "+92 300 4442211", address: "Model Town", openingBalance: 500 },
    cookie
  );
  if (!customer.body.success) throw new Error("Customer creation failed.");

  const supplier = await request("POST", "/api/suppliers", { name: "Smoke Test Supplier", phone: "+92 300 6655443" }, cookie);
  if (!supplier.body.success) throw new Error("Supplier creation failed.");

  const purchase = await request(
    "POST",
    "/api/purchases",
    {
      supplierId: supplier.body.supplier.id,
      status: "RECEIVED",
      items: [{ productId: rawMaterial.body.product.id, quantity: 5, unitCost: 1100 }]
    },
    cookie
  );
  if (!purchase.body.success || purchase.body.purchase.status !== "RECEIVED") throw new Error("Purchase creation/receive failed.");

  const production = await request(
    "POST",
    "/api/production",
    { finishedProductId: finishedProduct.body.product.id, quantityProduced: 3, status: "COMPLETED" },
    cookie
  );
  if (!production.body.success || production.body.production.status !== "COMPLETED") throw new Error("Production completion failed.");

  const lowStockBlock = await request(
    "POST",
    "/api/inventory/adjustments",
    { productId: finishedProduct.body.product.id, movementType: "REMOVE_STOCK", quantity: 9999, reason: "Smoke test negative stock check" },
    cookie
  );
  if (lowStockBlock.status !== 400) throw new Error("Negative stock protection failed.");

  const invoice = await request(
    "POST",
    "/api/invoices",
    {
      customerId: customer.body.customer.id,
      issueNow: true,
      items: [{ productId: finishedProduct.body.product.id, quantity: 2, unitPrice: 4200 }]
    },
    cookie
  );
  if (!invoice.body.success || !["ISSUED", "PARTIAL", "PAID"].includes(invoice.body.invoice.status)) throw new Error("Invoice creation/issue failed.");

  const firstInvoiceUnitPrice = invoice.body.invoice.items[0].unitPrice;
  if (firstInvoiceUnitPrice !== 4200) throw new Error("New invoice did not snapshot the current product price.");

  const updatedPrice = await request(
    "PATCH",
    `/api/products/${finishedProduct.body.product.id}`,
    {
      itemType: "FINISHED_PRODUCT",
      categoryId: categoryBy("FINISHED_PRODUCT", "Stove"),
      name: "Smoke Test 2 Burner Stove",
      sku: finishedProduct.body.product.sku,
      unitOfMeasure: "piece",
      costPrice: 2500,
      sellingPrice: 5100,
      openingStockQuantity: 0,
      lowStockThreshold: 2,
      canBeProduced: true,
      hasBillOfMaterials: true,
      bom: [{ rawMaterialId: rawMaterial.body.product.id, quantityRequired: 1, unitOfMeasure: "sheet" }]
    },
    cookie
  );
  if (!updatedPrice.body.success || updatedPrice.body.product.sellingPrice !== 5100) throw new Error("Product price update failed.");

  const newPriceInvoice = await request(
    "POST",
    "/api/invoices",
    {
      customerId: customer.body.customer.id,
      issueNow: false,
      items: [{ productId: finishedProduct.body.product.id, quantity: 1, unitPrice: 1 }]
    },
    cookie
  );
  if (!newPriceInvoice.body.success || newPriceInvoice.body.invoice.items[0].unitPrice !== 5100) throw new Error("New invoice did not use latest product price.");
  if (invoice.body.invoice.items[0].unitPrice !== 4200) throw new Error("Historical invoice price changed unexpectedly.");

  const order = await request(
    "POST",
    "/api/orders",
    {
      customerId: customer.body.customer.id,
      deliveryAddress: "Model Town",
      items: [{ productId: finishedProduct.body.product.id, productName: finishedProduct.body.product.name, quantity: 1, unitPrice: 4200 }]
    },
    cookie
  );
  if (!order.body.success) throw new Error("Order creation failed.");

  const delivery = await request("POST", "/api/deliveries", { orderId: order.body.order.id, status: "scheduled" }, cookie);
  if (!delivery.body.success) throw new Error("Delivery creation failed.");

  const deliveryStatus = await request("PATCH", `/api/deliveries/${delivery.body.delivery.id}/status`, { status: "completed" }, cookie);
  if (!deliveryStatus.body.success) throw new Error("Delivery status update failed.");

  const payment = await request(
    "POST",
    "/api/payments",
    { customerId: customer.body.customer.id, invoiceId: invoice.body.invoice.id, orderId: order.body.order.id, amount: 2500, paymentMethod: "CASH" },
    cookie
  );
  if (!payment.body.success) throw new Error("Payment creation failed.");

  const receiptUpload = await request(
    "POST",
    "/api/uploads",
    {
      entityType: "expense",
      entityId: "",
      fileName: "smoke-receipt.pdf",
      mimeType: "application/pdf",
      data: "data:application/pdf;base64,JVBERi0xLjQKJUVPRg=="
    },
    cookie
  );
  if (!receiptUpload.body.success) throw new Error("Receipt upload failed.");

  const expense = await request(
    "POST",
    "/api/expenses",
    {
      title: "Fuel refill",
      category: "vehicle",
      amount: 900,
      paymentMethod: "BANK_TRANSFER",
      receiptFileId: receiptUpload.body.file.id,
      receiptFileName: receiptUpload.body.file.originalName
    },
    cookie
  );
  if (!expense.body.success || expense.body.expense.paymentMethod !== "BANK_TRANSFER" || !expense.body.expense.receiptFileId) throw new Error("Expense creation failed.");

  const expenseReceipt = await request("GET", `/api/uploads/${receiptUpload.body.file.id}`, null, cookie);
  if (expenseReceipt.status !== 200) throw new Error("Expense receipt download failed.");

  const report = await request("GET", `/api/reports/summary?from=2026-01-01&to=2026-12-31`, null, cookie);
  if (!report.body.success || report.body.report.totals.orders < 1 || report.body.report.totals.invoices < 1) throw new Error("Report calculation failed.");

  const inventoryReport = await request("GET", "/api/reports/product-stock", null, cookie);
  if (!inventoryReport.body.success || !Array.isArray(inventoryReport.body.report.rows)) throw new Error("Inventory report failed.");

  const inventoryFilter = await request("GET", `/api/inventory?search=${encodeURIComponent("Smoke Test 2 Burner Stove")}&itemType=FINISHED_PRODUCT`, null, cookie);
  if (!inventoryFilter.body.success || !inventoryFilter.body.inventory.length) throw new Error("Inventory filters failed.");

  const invoicePrint = await request("GET", `/api/invoices/${invoice.body.invoice.id}/print`, null, cookie);
  if (invoicePrint.status !== 200 || !String(invoicePrint.body || "").includes("Invoice")) throw new Error("Invoice print failed.");

  const invoicePdf = await request("GET", `/api/invoices/${invoice.body.invoice.id}/pdf`, null, cookie);
  if (invoicePdf.status !== 200) throw new Error("Invoice PDF failed.");

  const receiptPrint = await request("GET", `/api/payments/${payment.body.payment.id}/receipt/print`, null, cookie);
  if (receiptPrint.status !== 200 || !String(receiptPrint.body || "").includes("Receipt")) throw new Error("Receipt print failed.");

  const receiptPdf = await request("GET", `/api/payments/${payment.body.payment.id}/receipt/pdf`, null, cookie);
  if (receiptPdf.status !== 200) throw new Error("Receipt PDF failed.");

  const statementPdf = await request("GET", `/api/customers/${customer.body.customer.id}/statement/pdf`, null, cookie);
  if (statementPdf.status !== 200) throw new Error("Customer statement PDF failed.");

  const summaryPdf = await request("GET", "/api/reports/summary/pdf?from=2026-01-01&to=2026-12-31", null, cookie);
  if (summaryPdf.status !== 200) throw new Error("Summary PDF export failed.");

  const namedReportPdf = await request("GET", "/api/reports/profit/pdf?from=2026-01-01&to=2026-12-31", null, cookie);
  if (namedReportPdf.status !== 200) throw new Error("Named report PDF endpoint failed.");

  const invoiceShare = await request("POST", "/api/share-links", { entityType: "invoice", entityId: invoice.body.invoice.id }, cookie);
  if (!invoiceShare.body.success || !invoiceShare.body.shareLink.pdfUrl.includes("/api/share/")) throw new Error("Invoice share link creation failed.");
  const invoiceSharePdf = await request("GET", invoiceShare.body.shareLink.pdfPath, null);
  if (invoiceSharePdf.status !== 200) throw new Error("Public invoice share PDF failed.");

  const reportShare = await request("POST", "/api/share-links", { entityType: "report", reportType: "summary", from: "2026-01-01", to: "2026-12-31" }, cookie);
  if (!reportShare.body.success || !reportShare.body.shareLink.pdfUrl.includes("/api/share/")) throw new Error("Report share link creation failed.");
  const reportSharePdf = await request("GET", reportShare.body.shareLink.pdfPath, null);
  if (reportSharePdf.status !== 200) throw new Error("Public report share PDF failed.");

  const summaryXlsx = await request("GET", "/api/reports/summary/xlsx?from=2026-01-01&to=2026-12-31", null, cookie);
  if (summaryXlsx.status !== 200) throw new Error("Summary XLSX export failed.");

  const search = await request("GET", "/api/search?q=Rafiq", null, cookie);
  if (!search.body.success || !search.body.results.length) throw new Error("Global search failed.");

  const backup = await request("POST", "/api/backup/create", {}, cookie);
  if (!backup.body.success) throw new Error("Backup creation failed.");

  const backupDownload = await request("GET", `/api/backup/${backup.body.backup.id}/download`, null, cookie);
  const backupJson = typeof backupDownload.body === "string" ? JSON.parse(backupDownload.body) : backupDownload.body;
  const backupValidation = await request("POST", "/api/backup/validate", { backup: backupJson }, cookie);
  if (!backupValidation.body.success || !backupValidation.body.preview.collectionCounts.masterdata) throw new Error("Backup validation or master data backup coverage failed.");

  const archiveExpense = await request("PATCH", `/api/expenses/${expense.body.expense.id}/archive`, {}, cookie);
  if (!archiveExpense.body.success) throw new Error("Expense archive failed.");

  const recycle = await request("GET", "/api/recycle-bin", null, cookie);
  if (!recycle.body.success || !recycle.body.items.some((item) => item.record.id === expense.body.expense.id)) throw new Error("Recycle bin failed.");

  const restore = await request("POST", `/api/recycle-bin/expenses/${expense.body.expense.id}/restore`, {}, cookie);
  if (!restore.body.success) throw new Error("Recycle restore failed.");

  const dashboard = await request("GET", "/api/dashboard/summary", null, cookie);
  if (!dashboard.body.success) throw new Error("Dashboard failed.");

  const colors = await request(
    "PATCH",
    "/api/settings/branding",
    {
      primaryColor: "#13756D",
      primaryHoverColor: "#0F5F58",
      sidebarBackgroundColor: "#0F1A24",
      sidebarActiveColor: "#1F2D3A",
      buttonTextColor: "#FFFFFF"
    },
    cookie
  );
  if (!colors.body.success || colors.body.settings.primaryHoverColor !== "#0F5F58") throw new Error("Brand color save failed.");

  const invalidColor = await request("PATCH", "/api/settings/branding", { primaryColor: "not-a-color" }, cookie);
  if (invalidColor.status !== 400) throw new Error("Invalid color validation failed.");

  const svgLogo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#13756D"/><text x="12" y="26" fill="#FFFFFF" font-family="Arial" font-size="18">DawnGas</text></svg>').toString("base64");
  const logo = await request("POST", "/api/settings/logo", { fileName: "dawngas-logo.svg", mimeType: "image/svg+xml", data: svgLogo }, cookie);
  if (!logo.body.success || !logo.body.settings.logoUrl) throw new Error("Logo upload failed.");
  const removeLogo = await request("DELETE", "/api/settings/logo", {}, cookie);
  if (!removeLogo.body.success || removeLogo.body.settings.logoUrl) throw new Error("Logo removal failed.");

  await request("POST", "/api/auth/logout", {}, cookie);
  const protectedAfterLogout = await request("GET", "/api/dashboard/summary", null, cookie);
  if (protectedAfterLogout.status !== 401) throw new Error("Protected routes remained accessible after logout.");

  console.log("Smoke test passed.");
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
