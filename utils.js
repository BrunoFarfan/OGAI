import puppeteer from 'puppeteer';
import fs from 'fs/promises';


const acceptCookies = async (page) => {
    const cookiesSelector = "#onetrust-accept-btn-handler";
    const addSelector = "#advertClose";

    // Check if the cookies button exists and click it
    try {
        await page.click(cookiesSelector);
        console.log("Cookies accepted");
    } catch (error) {
        console.log("Cookies button not found");
    }

    // Check if the ad close button exists and click it
    try {
        await page.click(addSelector);
        console.log("Ad closed");
    } catch (error) {
        console.log("Ad close button not found");
    }
};

export const loadPage = async (page, url) => {
    await page.goto(url, { timeout: 0, waitUntil: "domcontentloaded" });
    console.log("Page loaded");

    await acceptCookies(page);
};

export const chunkArray = (array, chunkSize) => {
    const result = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        result.push(array.slice(i, i + chunkSize));
    }
    return result;
};