const puppeteer = require('puppeteer');
const fs = require('fs');


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

const loadPage = async (page, url) => {
    await page.goto(url, {timeout: 0, waitUntil: "domcontentloaded"});
    console.log("Page loaded");

    await acceptCookies(page);
};

const loadAllClubs = async (page) => {
    const clubs = await page.evaluate(async () => {
        // Scroll to the bottom of the page
        window.scrollTo(0, document.body.scrollHeight);

        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds

        rowsList = document.querySelectorAll("#mainContent > div.clubIndex > div > div > div:nth-child(3) > div > table > tbody > tr > td.team > a");
        return Array.from(rowsList).map(row => row.href);
    });
    return clubs;
};

const getMatchesStats = async (page, maxMatchID) => {
    let matchID = 1;
    const matches = [];
    while (matchID <= maxMatchID) {
        const matchUrl = `https://www.premierleague.com/match/${matchID}`;
        await loadPage(page, matchUrl);

        await acceptCookies(page);

        matchID++;
    }
};

const getClubSeasons = async (page, clubUrl) => {
    // https://www.premierleague.com/clubs/1/Arsenal/overview --> https://www.premierleague.com/clubs/1/Arsenal/stats
    const statsUrl = clubUrl.replace("overview", "stats");
    await loadPage(page, statsUrl); // Load the stats page

    const stats = await page.evaluate(async () => {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds

        const seasonsDropDownSelector = "#mainContent > div.wrapper.col-12 > div > div > section > div.dropDown.mobile";
        const seasonsDropDown = document.querySelector(seasonsDropDownSelector);
        if (seasonsDropDown) {
            seasonsDropDown.click(); // Directly click the dropdown
            console.log("Dropdown clicked");
        } else {
            console.log("Dropdown not found");
            return [];
        }
        // Assuming there's a slight delay needed after clicking for the options to become visible
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
        
        const seasons = document.querySelectorAll(seasonsDropDownSelector + ".mobile.open > div.dropdownListContainer > ul > li");
        const seasonData = Array.from(seasons).map(li => ({
            optionName: li.getAttribute('data-option-name'),
            optionId: li.getAttribute('data-option-id'),
            optionIndex: li.getAttribute('data-option-index'),
        }));
        // Remove first element which is 'All Seasons'
        seasonData.shift();
        
        return seasonData;
    });
    return stats;
};

const getClubStats = async (page, clubUrl, seasonID) => {
    let seasonUrl = clubUrl.replace("overview", "stats");
    seasonUrl = seasonUrl + "?se=" + seasonID;

    await loadPage(page, seasonUrl); // Load the stats page

    await acceptCookies(page);

    const stats = await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);

        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds

        const matchesPlayed = document.querySelector("#mainContent > div.wrapper.col-12 > div > div > div > div:nth-child(1) > div.all-stats__top-stat").innerText;
        const matchesWon = document.querySelector("#mainContent > div.wrapper.col-12 > div > div > div > div:nth-child(2) > div.all-stats__top-stat").innerText;
        const matchesLost = document.querySelector("#mainContent > div.wrapper.col-12 > div > div > div > div:nth-child(3) > div.all-stats__top-stat").innerText;
        
        const generalStats = document.querySelectorAll("#mainContent > div.wrapper.col-12 > div > div > ul > li > div");
        const generalDataArray = [];
        generalStats.forEach((stat) => {
            const statName = stat.querySelector(".all-stats__header-stat").innerText;
            const statsDivs = stat.querySelectorAll(".all-stats__regular-stat-container");
            const statsArray = [];
            statsDivs.forEach((div) => {
                const particularStatName = div.querySelector(".all-stats__regular-stat-name").innerText;
                const particularStatValue = div.querySelector(".all-stats__regular-stat > span").innerText;

                statsArray.push({
                    statName: particularStatName,
                    statValue: particularStatValue,
                });
            });

            generalDataArray.push({
                statName: statName,
                stats: statsArray,
            });
        });

        return {
            matchesPlayed: matchesPlayed,
            matchesWon: matchesWon,
            matchesLost: matchesLost,
            generalStats: generalDataArray,
        };
    });

    return stats;
};

const main = async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    page.on("console", msg => console.log("PAGE LOG:", msg.text())); // Log the console messages

    await loadPage(page, 'https://www.premierleague.com/clubs');

    const clubs = await loadAllClubs(page);

    const finalArray = [];

    for (let i = 0; i < clubs.length; i++) {
        const statistics = await getClubSeasons(page, clubs[i]);
        const clubName = clubs[i].split("/")[5];
        const seasonsArray = [];
        
        for (let j = 0; j < statistics.length; j++) {
            const seasonID = statistics[j].optionId;
            const seasonName = statistics[j].optionName;
    
            const clubSeasonStats = await getClubStats(page, clubs[i], seasonID);
            
            seasonsArray.push({
                seasonID: seasonName,
                stats: clubSeasonStats,
            });
        }

        finalArray.push({
            clubName: clubName,
            seasons: seasonsArray,
        });
    };
    // Convert the final array to JSON and write it to a file
    fs.writeFileSync("outputs/seasonsOutput.json", JSON.stringify(finalArray, null, 2));

    await browser.close();
}

main();