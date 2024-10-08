const puppeteer = require('puppeteer');
const fs = require('fs').promises;

const MAX_CONCURRENT_TABS = 5; // Maximum number of tabs to open concurrently

const acceptCookies = async (page) => {
    const cookiesSelector = "#onetrust-accept-btn-handler";
    const addSelector = "#advertClose";

    try {
        await page.click(cookiesSelector);
        console.log("Cookies accepted");
    } catch (error) {
        console.log("Cookies button not found");
    }

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

const getMatchStatsForChunk = async (page, matchIDs, scrapedMatches, remainingMatches) => {
    const results = [];
    for (const matchID of matchIDs) {
        try {
            const matchStats = await getMatchStats(page, matchID);
            results.push(matchStats);

            // Update scrapedMatches and remainingMatches
            scrapedMatches.push(matchID);
            const index = remainingMatches.indexOf(matchID);
            if (index > -1) {
                remainingMatches.splice(index, 1);
            }
        } catch (error) {
            console.log(`Error scraping match ${matchID}:`, error);
            // If there's an error, do not remove the matchID from remainingMatches
        }
    }
    return results;
};

const getAllMatchesIDs = async (page) => {
    const allSeasons = await getClubSeasons(page, "https://www.premierleague.com/clubs/1/Arsenal/overview");

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
                            allSeasonMatches.push(matches[j].getAttribute("data-comp-match-item"));
                        }
                    }
                    resolve(allSeasonMatches);
                }, 25000);
            });
        });

        allMatchesIDs.push(...matches);
    }
    console.log(allMatchesIDs);

    return allMatchesIDs;
};

const getAllMatchesStats = async (browser) => {
    let allMatchesIDs, remainingMatchesIDs, scrapedMatchesIDs = [];
    let scrapedMatchesStats = [];

    try {
        const idsFromFile = await fs.readFile('outputs/matchesIDS.json', 'utf8');
        allMatchesIDs = JSON.parse(idsFromFile);
    } catch (error) {
        allMatchesIDs = await getAllMatchesIDs();
        await fs.writeFile('outputs/matchesIDS.json', JSON.stringify(allMatchesIDs, null, 2));
    }

    try {
        const remainingFromFile = await fs.readFile('outputs/remainingMatchesIDs.json', 'utf8');
        remainingMatchesIDs = JSON.parse(remainingFromFile);
    } catch (error) {
        remainingMatchesIDs = [...allMatchesIDs];
        await fs.writeFile('outputs/remainingMatchesIDs.json', JSON.stringify(remainingMatchesIDs, null, 2));
    }

    try {
        const scrapedFromFile = await fs.readFile('outputs/scrapedMatchesIDs.json', 'utf8');
        scrapedMatchesIDs = JSON.parse(scrapedFromFile);
    } catch (error) {
        scrapedMatchesIDs = [];
        await fs.writeFile('outputs/scrapedMatchesIDs.json', JSON.stringify(scrapedMatchesIDs, null, 2));
    }

    try {
        const scrapedStatsFromFile = await fs.readFile('outputs/scrapedMatchesStats.json', 'utf8');
        scrapedMatchesStats = JSON.parse(scrapedStatsFromFile);
    } catch (error) {
        scrapedMatchesStats = [];
        await fs.writeFile('outputs/scrapedMatchesStats.json', JSON.stringify(scrapedMatchesStats, null, 2));
    }

    const chunks = chunkArray(remainingMatchesIDs, Math.ceil(remainingMatchesIDs.length / MAX_CONCURRENT_TABS));

    const processChunkInTab = async (chunk) => {
        const page = await browser.newPage();
        const results = await getMatchStatsForChunk(page, chunk, scrapedMatchesIDs, remainingMatchesIDs);
        await page.close();
        return results;
    };

    for (const chunk of chunks) {
        const chunkResults = await processChunkInTab(chunk);

        scrapedMatchesStats = scrapedMatchesStats.concat(chunkResults);

        await fs.writeFile('outputs/scrapedMatchesStats.json', JSON.stringify(scrapedMatchesStats, null, 2));
        await fs.writeFile('outputs/scrapedMatchesIDs.json', JSON.stringify(scrapedMatchesIDs, null, 2));
        await fs.writeFile('outputs/remainingMatchesIDs.json', JSON.stringify(remainingMatchesIDs, null, 2));
    }

    return scrapedMatchesStats;
};

const getMatchStats = async (page, matchID) => {
    const matchUrl = `https://www.premierleague.com/match/${matchID}`;
    await loadPage(page, matchUrl);

    const stats = await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);

        await new Promise(resolve => setTimeout(resolve, 4500));

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

        const statsTab = document.querySelector("#mainContent > div > section.mcContent > div.centralContent > div > div.wrapper.col-12 > div > div > ul > li:nth-child(3)");

        if (statsTab) {
            statsTab.click();
        } else {
            console.log("Stats tab not found");
            return { matchResult: matchResult, matchStats: [] };
        }

        await new Promise(resolve => setTimeout(resolve, 500));

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
        window.scrollTo(0, document.body.scrollHeight);

        await new Promise(resolve => setTimeout(resolve, 3000));

        rowsList = document.querySelectorAll("#mainContent > div.clubIndex > div > div > div:nth-child(3) > div > table > tbody > tr > td.team > a");
        return Array.from(rowsList).map(row => row.href);
    });
    console.log(clubs);

    return clubs;
};

const getClubSeasons = async (page, clubUrl) => {
    const statsUrl = clubUrl.replace("overview", "stats");
    await loadPage(page, statsUrl);

    const stats = await page.evaluate(async () => {
        await new Promise(resolve => setTimeout(resolve, 3000));

        const seasonsDropDownSelector = "#mainContent > div.wrapper.col-12 > div > div > section > div.dropDown.mobile";
        const seasonsDropDown = document.querySelector(seasonsDropDownSelector);
        if (seasonsDropDown) {
            seasonsDropDown.click();
            console.log("Dropdown clicked");
        } else {
            console.log("Dropdown not found");
            return [];
        }
        await new Promise(resolve => setTimeout(resolve, 1000));

        const seasons = document.querySelectorAll(seasonsDropDownSelector + ".mobile.open > div.dropdownListContainer > ul > li");
        const seasonData = Array.from(seasons).map(li => ({
            optionName: li.getAttribute('data-option-name'),
            optionId: li.getAttribute('data-option-id'),
            optionIndex: li.getAttribute('data-option-index'),
        }));
        seasonData.shift();

        return seasonData;
    });
    console.log(stats);

    return stats;
};

const getClubSeasonalStats = async (page, clubUrl, seasonID) => {
    let seasonUrl = clubUrl.replace("overview", "stats");
    seasonUrl = seasonUrl + "?se=" + seasonID;

    await loadPage(page, seasonUrl);

    const stats = await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);

        await new Promise(resolve => setTimeout(resolve, 3000));

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

const getSeasonalStats = async (page) => {
    await loadPage(page, 'https://www.premierleague.com/clubs');

    const clubs = await loadAllClubs(page);

    const finalArray = [];

    for (let i = 0; i < clubs.length; i++) {
        const seasons = await getClubSeasons(page, clubs[i]);
        const clubName = clubs[i].split("/")[5];
        const seasonsArray = [];

        for (let j = 0; j < seasons.length; j++) {
            const seasonID = seasons[j].optionId;
            const seasonName = seasons[j].optionName;

            const clubSeasonStats = await getClubSeasonalStats(page, clubs[i], seasonID);

            seasonsArray.push({
                seasonName: seasonName,
                stats: clubSeasonStats,
            });
            seasonsArray.reverse();
        }

        finalArray.push({
            clubName: clubName,
            seasons: seasonsArray,
        });
    };

    return finalArray;
};

const main = async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    page.on("console", msg => console.log("PAGE LOG:", msg.text()));

    const allMatchesStats = await getAllMatchesStats(browser);

    await fs.writeFile("outputs/matchesOutput.json", JSON.stringify(allMatchesStats, null, 2));

    await browser.close();
}

main();
