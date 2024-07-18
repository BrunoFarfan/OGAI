const puppeteer = require('puppeteer');
const fs = require('fs').promises;


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

const getAllMatchesIDs = async (page) => {
    const allSeasons = await getClubSeasons(page, "https://www.premierleague.com/clubs/1/Arsenal/overview"); // Arsenal because it has been in the league since the beginning

    const allMatchesIDs = [];
    for (let i = 0; i < allSeasons.length; i++) {
        const seasonID = allSeasons[i].optionId;
        
        await loadPage(page, `https://www.premierleague.com/results?se=${seasonID}&co=1&cl=-1`);

        const matches = await page.evaluate(async () => {
            window.scrollTo(0, document.body.scrollHeight);

            await new Promise(resolve => setTimeout(resolve, 25000)); // Wait for all the matches to load

            const matchesList = document.querySelectorAll("#mainContent > div.tabbedContent > div.wrapper.col-12.active > div:nth-child(3) > section > div:nth-child(1) > div.fixtures__matches-list > ul > li")
            return Array.from(matchesList).map(match => match.getAttribute("data-comp-match-item"));
        }); 

        allMatchesIDs.push(...matches);
    }
    console.log(allMatchesIDs);

    return allMatchesIDs;
};

const getAllMatchesStats = async (page) => {
    let allMatchesIDs;

    try {
        // Attempt to read the IDs from 'outputs/matchesIDS.json'
        const idsFromFile = await fs.readFile('outputs/matchesIDS.json', 'utf8');
        allMatchesIDs = JSON.parse(idsFromFile);
    } catch (error) {
        // If the file does not exist or there's an error, fetch the IDs
        allMatchesIDs = await getAllMatchesIDs(page);
        // Write the fetched IDs back to 'outputs/matchesIDS.json'
        await fs.writeFile('outputs/matchesIDS.json', JSON.stringify(allMatchesIDs, null, 2));
    }

    const allMatchesStats = [];
    for (let i = 0; i < allMatchesIDs.length; i++) {
        const matchID = allMatchesIDs[i];
        const matchStats = await getMatchStats(page, matchID);
        allMatchesStats.push(matchStats);
    }

    return allMatchesStats;
};

const getMatchStats = async (page, matchID) => {
    const matchUrl = `https://www.premierleague.com/match/${matchID}`;
    await loadPage(page, matchUrl);

    const stats = await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        
        await new Promise(resolve => setTimeout(resolve, 2500)); // Wait for 2.5 seconds

        // Get match result
        const teamNames = document.querySelectorAll("a.mc-summary__badge-container");
        const homeTeamName = teamNames[0].href.split("/")[5];
        const awayTeamName = teamNames[1].href.split("/")[5];
        const homeTeamGoals = document.querySelector("div.mc-summary__score.js-mc-score").innerText[0];
        const awayTeamGoals = document.querySelector("div.mc-summary__score.js-mc-score").innerText[4];

        const matchResult = {
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
            return {matchResult: matchResult, matchStats: []};
        }

        await new Promise(resolve => setTimeout(resolve, 100)); // Wait for 100 milliseconds

        const statsTable = document.querySelector("#mainContent > div > section.mcContent > div.centralContent > div > div.mcTabs > section.mcMainTab.head-to-head.active > div.mcTabs > div.mcStatsTab.statsSection.season-so-far.wrapper.col-12.active > table");

        if (statsTable) {
            const statsRows = statsTable.querySelectorAll("tbody > tr");

            console.log("bitch nigga:", statsRows[0].querySelector("td:nth-child(2) > p").innerText);
            
            const statsArray = Array.from(statsRows).map(row => ({
                statName: row.querySelector("td:nth-child(2) > p").innerText,
                homeStatValue: row.querySelector("td:nth-child(1) > p").innerText,
                awayStatValue: row.querySelector("td:nth-child(3) > p").innerText,
            }));

            return {matchResult: matchResult, matchStats: statsArray};
        } else {
            console.log("Stats table not found");
            return {matchResult: matchResult, matchStats: []};
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
            // Invert the order of the seasons
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
    
    page.on("console", msg => console.log("PAGE LOG:", msg.text())); // Log the console messages

    const allMatchesStats = await getAllMatchesStats(page);

    // const seasonalDataArray = await getSeasonalStats(page);
    // Convert the data array to JSON and write it to a file
    await fs.writeFile("outputs/matchesOutput.json", JSON.stringify(allMatchesStats, null, 2));
    // await fs.writeFile("outputs/seasonsOutput.json", JSON.stringify(seasonalDataArray, null, 2));

    await browser.close();
}

main();