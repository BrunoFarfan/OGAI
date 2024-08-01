import { loadPage, chunkArray } from './utils.js';


const MAX_CONCURRENT_TABS = 1; // Maximum number of tabs to open concurrently

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

export const getClubSeasons = async (page, clubUrl) => {
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

const getSeasonStatsForChunk = async (page, clubs) => {
    const results = [];

    for (const clubUrl of clubs) {
        const clubName = clubUrl.split("/")[5];
        const seasons = await getClubSeasons(page, clubUrl);
        const seasonsArray = [];

        for (const season of seasons) {
            const seasonID = season.optionId;
            const seasonName = season.optionName;

            const clubSeasonStats = await getClubSeasonalStats(page, clubUrl, seasonID);

            seasonsArray.push({
                seasonName: seasonName,
                stats: clubSeasonStats,
            });
            // Invert the order of the seasons
            seasonsArray.reverse();
        }

        results.push({
            clubName: clubName,
            seasons: seasonsArray,
        });
    }

    return results;
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

export const getSeasonalStats = async (browser) => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await loadPage(page, 'https://www.premierleague.com/clubs');

    const clubs = await loadAllClubs(page);
    await page.close();

    const chunks = chunkArray(clubs, Math.ceil(clubs.length / MAX_CONCURRENT_TABS));

    const processChunkInTab = async (chunk) => {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        const results = await getSeasonStatsForChunk(page, chunk);
        await page.close();
        return results;
    };

    const allSeasonalStatsChunks = await Promise.all(chunks.map(chunk => processChunkInTab(chunk)));

    const seasonalDataArray = allSeasonalStatsChunks.flat();

    return seasonalDataArray;
};