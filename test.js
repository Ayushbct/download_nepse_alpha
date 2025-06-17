const puppeteer = require('puppeteer');
const URL = "https://nepsealpha.com/nepse-chart";
const fileName = 'Broker_Analysis.xlsx';
const today = new Date().toISOString().split('T')[0];
const fs = require('fs');
const crypto = require('crypto');
const xlsx = require('xlsx');
const CACHE_FILE = 'data-cache.json';


// git clone https://x-access-token:$REPO_B_PAT@github.com/Ayushbct/testing-for-nepse.git
// git clone https://x-access-token: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@github.com/Ayushbct/testing-for-nepse.git

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await applyStealthSettings(page);

    try {
        await page.goto(URL, { waitUntil: 'networkidle2' });
        console.log("📄 Page loaded");

        await clickChartIcon(page);
        await clickPrimePicks(page);
        await clickBrokerPicks(page);

        const tableData = await extractTableData(page);
        await updateExcelIfChanged(tableData);

    } catch (err) {
        console.error("❌ Unexpected error:", err);
    } finally {
        await browser.close();
    }
})();

// -------------------------------------------
// Step Functions
// -------------------------------------------

async function applyStealthSettings(page) {
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    );
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });
    });
}

async function clickChartIcon(page) {
    try {
        await page.waitForSelector('i.fa-line-chart');
        const chartIcon = await page.$('i.fa-line-chart');
        if (chartIcon) {
            await chartIcon.click();
            console.log("✅ Chart icon clicked");
            await delay(2000);
        } else {
            console.log("❌ Chart icon not found");
        }
    } catch (err) {
        console.error("❌ Failed to click chart icon", err);
    }
}

async function clickPrimePicks(page) {
    const selector = "#app > div.v-application--wrap > div.split.d-flex.with-side-menu > div:nth-child(3) > div > div.side-bar-menu-items > div > div > div.mt-2.text-center > button:nth-child(3) > span";

    try {
        await page.waitForSelector(selector, { timeout: 10000 });
        const span = await page.$(selector);
        if (span) {
            await span.evaluate(el => el.scrollIntoView());
            const button = await span.evaluateHandle(el => el.closest('button'));
            await button.click();
            console.log("✅ 'Prime Picks' button clicked");
            await delay(2000);
        }
    } catch (err) {
        console.error("❌ Failed to click 'Prime Picks'", err);
    }
}

async function clickBrokerPicks(page) {
    try {
        await page.waitForSelector("span", { timeout: 20000 });
        const spans = await page.$$("span");
        for (const span of spans) {
            const text = await span.evaluate(el => el.innerText.trim());
            if (text === "Broker Picks") {
                await span.evaluate(el => el.scrollIntoView());
                await span.click();
                console.log("✅ 'Broker Picks' span clicked");
                await delay(2000);
                break;
            }
        }
    } catch (err) {
        console.error("❌ Failed to click 'Broker Picks'", err);
    }
}

async function extractTableData(page) {
    const data = [];
    try {
        await page.waitForSelector('table thead tr', { timeout: 10000 });
        const headers = await page.$$eval('table thead tr th', ths => ths.map(th => th.innerText.trim()));
        data.push(headers);

        await page.waitForSelector('table tbody tr', { timeout: 20000 });
        const rows = await page.$$('table tbody tr');

        console.log(`✅ Found ${rows.length} data rows`);
        for (let row of rows) {
            const cells = await row.$$eval('td', tds => tds.map(td => td.innerText.trim()).filter(text => text !== ""));
            if (cells.length === 1 && cells[0].toLowerCase() === "no data available") {
                console.log("⏭️ Skipping 'no data available' row");
                continue;
            }
            // console.log(cells.join(" | "));
            data.push(cells);
        }
    } catch (err) {
        console.error("❌ Failed to extract table data", err);
    }
    return data;
}


// Helper: Compute SHA-256 hash of table data
function getTableHash(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

// Load or initialize cache
function loadCache() {
    if (fs.existsSync(CACHE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        } catch {
            console.warn("⚠️ Failed to parse cache, starting fresh.");
        }
    }
    return {};
}

// Save cache to disk
function saveCache(cache) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

async function updateExcelIfChanged(tableData) {
    if (tableData.length === 0) {
        console.log("❌ No data to write to Excel.");
        return;
    }

    const dataHash = getTableHash(tableData);
    const cache = loadCache();

    let workbook;
    if (fs.existsSync(fileName)) {
        workbook = xlsx.readFile(fileName);

        // Preload hashes for existing sheets if not cached
        for (const sheetName of workbook.SheetNames) {
            // Skip if hash already cached
            if (Object.values(cache).includes(sheetName)) continue;

            const sheet = workbook.Sheets[sheetName];
            const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

            const sheetHash = getTableHash(sheetData);
            if (!cache[sheetHash]) {
                cache[sheetHash] = sheetName;
                console.log(`🔄 Cached hash for existing sheet '${sheetName}'`);
            }
        }
        saveCache(cache);
    } else {
        workbook = xlsx.utils.book_new();
        console.log("📘 Creating new workbook.");
    }

    if (cache[dataHash]) {
        console.log(`🟡 Data already processed (first seen on ${cache[dataHash]}). Skipping XLSX update.`);
        return;
    }

    let shouldWrite = true;

    if (workbook.SheetNames.includes(today)) {
        const existingSheet = workbook.Sheets[today];
        const existingData = xlsx.utils.sheet_to_json(existingSheet, { header: 1 });

        const sameLength = existingData.length === tableData.length;
        const sameContent = sameLength && existingData.every((row, i) =>
            JSON.stringify(row) === JSON.stringify(tableData[i])
        );

        if (sameContent) {
            console.log("🟡 Same data already exists in today's sheet. Skipping update.");
            shouldWrite = false;
        } else {
            console.log("🔁 Today's sheet exists but data is different. Replacing sheet.");
            delete workbook.Sheets[today];
            workbook.SheetNames = workbook.SheetNames.filter(name => name !== today);
        }
    } else {
        console.log("📄 Workbook exists but today's sheet is new.");
    }

    if (shouldWrite) {
        const worksheet = xlsx.utils.aoa_to_sheet(tableData);
        workbook.SheetNames.unshift(today);
        workbook.Sheets[today] = worksheet;
        xlsx.writeFile(workbook, fileName);
        console.log(`✅ Excel updated with sheet '${today}'`);

        // Save new data hash in cache
        cache[dataHash] = today;
        saveCache(cache);
    }
}






function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
