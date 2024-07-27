import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import { getClubSeasons } from './seasonScraping.js';
import { loadPage, chunkArray } from './utils.js';


const MAX_CONCURRENT_TABS = 5; // Maximum number of tabs to open concurrently

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

export const getAllMatchesStats = async (browser) => {
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