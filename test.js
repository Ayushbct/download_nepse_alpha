const puppeteer = require('puppeteer');
const xlsx = require('xlsx');

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();

    // Set a realistic user-agent
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    );

    // Hide the webdriver property
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });
    });

    try {
        await page.goto("https://nepsealpha.com/nepse-chart", { waitUntil: 'networkidle2' });
        console.log("📄 Page loaded");
        await page.screenshot({ path: 'step0.png' });

        // Step 1: Click the first button
        try {
            await page.waitForSelector('i.fa-line-chart'); // wait for the icon to appear
            const chartIcon = await page.$('i.fa-line-chart');
            if (chartIcon) {
                await chartIcon.click(); // click it
                console.log("✅ Chart icon clicked");
            } else {
                console.log("❌ Chart icon not found");
            }


            
            await page.screenshot({ path: 'step1.png' });
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (err) {
            console.error("❌ Failed to click chart icon", err);
        }

        
        // Step 2: Click "Prime Picks" button using provided selector
        try {
            console.log("⏳ Waiting for 'Prime Picks' button selector...");
            const primePickSpanSelector = "#app > div.v-application--wrap > div.split.d-flex.with-side-menu > div:nth-child(3) > div > div.side-bar-menu-items > div > div > div.mt-2.text-center > button:nth-child(3) > span";
        
            await page.waitForSelector(primePickSpanSelector, { timeout: 10000 });
            const primePickSpan = await page.$(primePickSpanSelector);
        
            if (primePickSpan) {
                // Scroll into view and click the parent button of this span
                await primePickSpan.evaluate(el => el.scrollIntoView());
                const button = await primePickSpan.evaluateHandle(el => el.closest('button'));
                await button.click();
            
                console.log("✅ 'Prime Picks' button clicked");
                await page.screenshot({ path: 'step2.png' });
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                console.log("❌ 'Prime Picks' span not found");
            }
        } catch (err) {
            console.error("❌ Failed to click 'Prime Picks' button", err);
        }


        // Step 3: Click "Broker Picks"
        try {
            console.log("⏳ Waiting for 'Broker Picks' span...");
            await page.waitForSelector("span", { timeout: 20000 });
            const spans = await page.$$("span");
            for (const span of spans) {
                const text = await span.evaluate(el => el.innerText.trim());
                if (text === "Broker Picks") {
                    await span.evaluate(el => el.scrollIntoView());
                    await span.click();
                    console.log("✅ 'Broker Picks' span clicked");
                    await page.screenshot({ path: 'step3.png' });
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    break;
                }
            }
        } catch (err) {
            console.error("❌ Failed to click 'Broker Picks' span", err);
        }

        // Step 4: Extract table data
        // Step 4: Extract table headers + data rows and save to XLSX
        try {
            console.log("⏳ Waiting for table headers...");
            await page.waitForSelector('table thead tr', { timeout: 10000 });
        
            // Extract headers (column names)
            const headers = await page.$$eval('table thead tr th', ths =>
                ths.map(th => th.innerText.trim())
            );
        
            console.log("Headers:", headers.join(" | "));
        
            console.log("⏳ Waiting for data rows...");
            await page.waitForSelector('table tbody tr', { timeout: 20000 });
            const rows = await page.$$('table tbody tr');
        
            if (!rows.length) {
                console.log("❌ No data rows found");
            } else {
                console.log(`\n✅ Found ${rows.length} data rows:\n`);
            
                const tableData = [];
            
                // Add headers as the first row
                tableData.push(headers);
            
                for (let row of rows) {
                    const cells = await row.$$eval('td', tds =>
                        tds.map(td => td.innerText.trim()).filter(text => text !== "")
                    );
                    console.log(cells.join(" | "));
                    tableData.push(cells);
                }
            
                // Create workbook and worksheet
                const workbook = xlsx.utils.book_new();
                const worksheet = xlsx.utils.aoa_to_sheet(tableData);
                xlsx.utils.book_append_sheet(workbook, worksheet, 'Data');
            
                // Write to file
                xlsx.writeFile(workbook, 'nepse_data.xlsx');
                console.log("✅ Data saved to nepse_data.xlsx");
            
                await page.screenshot({ path: 'step4.png' });
            }
        } catch (err) {
            console.error("❌ Failed to extract headers or data rows or save XLSX", err);
        }


    } catch (err) {
        console.error("Unexpected error:", err);
    } finally {
        await browser.close();
    }
})();
