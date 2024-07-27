const puppeteer = require('puppeteer');
const fs = require('fs').promises;

const MAX_CONCURRENT_TABS = 5; // Maximum number of tabs to open concurrently

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
    await page.goto(url, { timeout: 0, waitUntil: "domcontentloaded" });
    console.log("Page loaded");

    await acceptCookies(page);
};

const chunkArray = (array, chunkSize) => {
    const result = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        result.push(array.slice(i, i + chunkSize));
    }
    return result;
};

const getMatchStatsForChunk = async (page, matchIDs, scrapedMatches, remainingMatches, scrapedMatchesStats) => {
    const results = [];
    for (const matchID of matchIDs) {
        try {
            const matchStats = await getMatchStats(page, matchID);
            results.push(matchStats);
            scrapedMatchesStats.push(matchStats);

            // Update scrapedMatches and remainingMatches
            scrapedMatches.push(matchID);
            const index = remainingMatches.indexOf(matchID);
            if (index > -1) {
                remainingMatches.splice(index, 1);
            }

            // Write updated lists to files
            await fs.writeFile('outputs/scrapedMatchesStats.json', JSON.stringify(scrapedMatchesStats, null, 2));
            await fs.writeFile('outputs/scrapedMatchesIDs.json', JSON.stringify(scrapedMatches, null, 2));
            await fs.writeFile('outputs/remainingMatchesIDs.json', JSON.stringify(remainingMatches, null, 2));
        } catch (error) {
            console.log(`Error scraping match ${matchID}:`, error);
            // If there's an error, do not remove the matchID from remainingMatches
        }
    }
    return results;
};

const getAllMatchesIDs = async (page) => {
    const allSeasons = await getClubSeasons(page, "https://www.premierleague.com/clubs/1/Arsenal/overview"); // Arsenal because it has been in the league since the beginning

    const allMatchesIDs = [];
    for (let i = 0; i < allSeasons.length; i++) {
        const seasonID = allSeasons[i].optionId;

        await loadPage(page, `https://www.premierleague.com/results?se=${seasonID}&co=1&cl=-1`);

        const matches = await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);

            return new Promise(resolve => {
                setTimeout(() => {
                    const datesContainers = document.querySelectorAll("#mainContent > div.tabbedContent > div.wrapper.col-12.active > div:nth-child(3) > section > div.fixtures__date-container");
                    const allSeasonMatches = [];
                    for (let i = 0; i < datesContainers.length; i++) {
                        const datesContainer = datesContainers[i];
                        const matches = datesContainer.querySelectorAll("div.fixtures__matches-list > ul > li");
                        for (let j = 0; j < matches.length; j++) {
                            // Directly push the attribute value instead of the element
                            allSeasonMatches.push(matches[j].getAttribute("data-comp-match-item"));
                        }
                    }
                    resolve(allSeasonMatches);
                }, 25000); // Wait for all the matches to load
            });
        });
        console.log("-------------->", matches);

        allMatchesIDs.push(...matches);
    }
    console.log(allMatchesIDs);

    return allMatchesIDs;
};

const getAllMatchesStats = async (browser) => {
    let allMatchesIDs, remainingMatchesIDs, scrapedMatchesIDs, scrapedMatchesStats = [];

    try {
        // Attempt to read the IDs from 'outputs/matchesIDS.json'
        const idsFromFile = await fs.readFile('outputs/matchesIDS.json', 'utf8');
        allMatchesIDs = JSON.parse(idsFromFile);
    } catch (error) {
        // If the file does not exist or there's an error, fetch the IDs
        allMatchesIDs = await getAllMatchesIDs();
        // Write the fetched IDs back to 'outputs/matchesIDS.json'
        await fs.writeFile('outputs/matchesIDS.json', JSON.stringify(allMatchesIDs, null, 2));
    }

    try {
        // Attempt to read the remaining IDs from 'outputs/remainingMatchesIDs.json'
        const remainingFromFile = await fs.readFile('outputs/remainingMatchesIDs.json', 'utf8');
        remainingMatchesIDs = JSON.parse(remainingFromFile);
    } catch (error) {
        // If the file does not exist, initialize it with allMatchesIDs
        remainingMatchesIDs = [...allMatchesIDs];
        await fs.writeFile('outputs/remainingMatchesIDs.json', JSON.stringify(remainingMatchesIDs, null, 2));
    }

    try {
        // Attempt to read the scraped IDs from 'outputs/scrapedMatchesIDs.json'
        const scrapedFromFile = await fs.readFile('outputs/scrapedMatchesIDs.json', 'utf8');
        scrapedMatchesIDs = JSON.parse(scrapedFromFile);
    } catch (error) {
        // If the file does not exist, initialize it as an empty array
        scrapedMatchesIDs = [];
        await fs.writeFile('outputs/scrapedMatchesIDs.json', JSON.stringify(scrapedMatchesIDs, null, 2));
    }

    try {
        // Attempt to read the stats from 'outputs/scrapedMatchesStats.json'
        const statsFromFile = await fs.readFile('outputs/scrapedMatchesStats.json', 'utf8');
        scrapedMatchesStats = JSON.parse(statsFromFile);
    } catch (error) {
        // If the file does not exist, initialize it as an empty array
        scrapedMatchesStats = [];
        await fs.writeFile('outputs/scrapedMatchesStats.json', JSON.stringify(scrapedMatchesStats, null, 2));
    }

    // Split match IDs into chunks for parallel processing
    const chunks = chunkArray(remainingMatchesIDs, Math.ceil(remainingMatchesIDs.length / MAX_CONCURRENT_TABS));

    // Function to process each chunk in a new tab
    const processChunkInTab = async (chunk) => {
        const page = await browser.newPage();
        const results = await getMatchStatsForChunk(page, chunk, scrapedMatchesIDs, remainingMatchesIDs, scrapedMatchesStats);
        await page.close();
        return results;
    };

    // Process all chunks in parallel
    const allMatchesStatsChunks = await Promise.all(chunks.map(chunk => processChunkInTab(chunk)));

    // Flatten the results array
    const allMatchesStats = allMatchesStatsChunks.flat();

    return allMatchesStats;
};

const getMatchStats = async (page, matchID) => {
    const matchUrl = `https://www.premierleague.com/match/${matchID}`;
    await loadPage(page, matchUrl);

    const stats = await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);

        await new Promise(resolve => setTimeout(resolve, 4500)); // Wait for the necessary elements to load

        // Get match result
        const teamNames = document.querySelectorAll("a.mc-summary__badge-container");
        const homeTeamName = teamNames[0].href.split("/")[5];
        const awayTeamName = teamNames[1].href.split("/")[5];
        const matchDate = document.querySelector("div.mc-summary__wrapper > div.mc-summary__info-container > div:nth-child(1)").innerText;
        const goals = document.querySelector("div.mc-summary__score.js-mc-score");
        const homeTeamGoals = goals.innerText[0];
        const awayTeamGoals = goals.innerText[4];

        const matchResult = {
            date: matchDate,
            homeTeam: homeTeamName,
            awayTeam: awayTeamName,
            homeTeamGoals: homeTeamGoals,
            awayTeamGoals: awayTeamGoals,
        };

        // Get match stats
        const statsTab = document.querySelector("#mainContent > div > section.mcContent > div.centralContent > div > div.wrapper.col-12 > div > div > ul > li:nth-child(3)");

        if (statsTab) {
            statsTab.click(); // Click the stats tab
        } else {
            console.log("Stats tab not found");
            return { matchResult: matchResult, matchStats: [] };
        }

        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for 100 milliseconds

        const statsTable = document.querySelector("#mainContent > div > section.mcContent > div.centralContent > div > div.mcTabs > section.mcMainTab.head-to-head.active > div.mcTabs > div.mcStatsTab.statsSection.season-so-far.wrapper.col-12.active > table");

        if (statsTable) {
            const statsRows = statsTable.querySelectorAll("tbody > tr");

            const statsArray = Array.from(statsRows).map(row => ({
                statName: row.querySelector("td:nth-child(2) > p").innerText,
                homeStatValue: row.querySelector("td:nth-child(1) > p").innerText,
                awayStatValue: row.querySelector("td:nth-child(3) > p").innerText,
            }));

            return { matchResult: matchResult, matchStats: statsArray };
        } else {
            console.log("Stats table not found");
            return { matchResult: matchResult, matchStats: [] };
        }
    });

    console.log(stats);

    return stats;
};

const loadAllClubs = async (page) => {
    const clubs = await page.evaluate(async () => {
        // Scroll to the bottom of the page
        window.scrollTo(0, document.body.scrollHeight);

        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for 3 seconds

        rowsList = document.querySelectorAll("#mainContent > div.clubIndex > div > div > div:nth-child(3) > div > table > tbody > tr > td.team > a");
        return Array.from(rowsList).map(row => row.href);
    });
    console.log(clubs);

    return clubs;
};

const getClubSeasons = async (page, clubUrl) => {
    // https://www.premierleague.com/clubs/1/Arsenal/overview --> https://www.premierleague.com/clubs/1/Arsenal/stats
    const statsUrl = clubUrl.replace("overview", "stats");
    await loadPage(page, statsUrl); // Load the stats page

    const stats = await page.evaluate(async () => {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for 3 seconds

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
    console.log(stats);

    return stats;
};

const getClubSeasonalStats = async (page, clubUrl, seasonID) => {
    let seasonUrl = clubUrl.replace("overview", "stats");
    seasonUrl = seasonUrl + "?se=" + seasonID;

    await loadPage(page, seasonUrl); // Load the stats page

    const stats = await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);

        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for 3 seconds

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

    console.log(stats);

    return stats;
};

const getSeasonalStats = async (browser) => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await loadPage(page, 'https://www.premierleague.com/clubs');

    const clubs = await loadAllClubs(page);
    await page.close();

    const chunks = chunkArray(clubs, Math.ceil(clubs.length / MAX_CONCURRENT_TABS));

    const processChunkInTab = async (chunk) => {
        const tabPage = await browser.newPage();
        await tabPage.setViewport({ width: 1920, height: 1080 });
        const finalArray = [];

        for (let i = 0; i < chunk.length; i++) {
            const seasons = await getClubSeasons(tabPage, chunk[i]);
            const clubName = chunk[i].split("/")[5];
            const seasonsArray = [];

            for (let j = 0; j < seasons.length; j++) {
                const seasonID = seasons[j].optionId;
                const seasonName = seasons[j].optionName;

                const clubSeasonStats = await getClubSeasonalStats(tabPage, chunk[i], seasonID);

                seasonsArray.push({
                    seasonName: seasonName,
                    stats: clubSeasonStats,
                });
                // Invert the order of the seasons
                seasonsArray.reverse();
            }

            finalArray.push({
                clubName: clubName,
                seasons: seasonsArray,
            });
        }

        await tabPage.close();
        return finalArray;
    };

    const allSeasonalStatsChunks = await Promise.all(chunks.map(chunk => processChunkInTab(chunk)));

    const seasonalDataArray = allSeasonalStatsChunks.flat();

    return seasonalDataArray;
};

const main = async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    page.on("console", msg => console.log("PAGE LOG:", msg.text())); // Log the console messages

    await getAllMatchesStats(browser);

    const seasonalDataArray = await getSeasonalStats(browser);
    // Convert the data array to JSON and write it to a file
    await fs.writeFile("outputs/seasonsOutput.json", JSON.stringify(seasonalDataArray, null, 2));

    await browser.close();
}

main();
