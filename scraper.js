import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import { getAllMatchesStats } from './matchScraping.js';
import { getSeasonalStats } from './seasonScraping.js';


const main = async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    page.on("console", msg => console.log("PAGE LOG:", msg.text())); // Log the console messages

    await getAllMatchesStats(browser);

    // const seasonalDataArray = await getSeasonalStats(page);
    // Convert the data array to JSON and write it to a file
    await fs.writeFile("outputs/seasonsOutput.json", JSON.stringify(seasonalDataArray, null, 2));

    await browser.close();
}

main();
