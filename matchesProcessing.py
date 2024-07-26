import json
import csv


matches = json.load(open('outputs/scrapedMatchesStats.json'))

# Initialize CSV columns
csv_columns = [
    'Date', 'Home Team', 'Away Team', 'Home Team Goals', 'Away Team Goals'
]
stat_columns = set()

# Extracting column names from JSON data
for match in matches:
    for stat in match['matchStats']:
        stat_columns.add(f"{stat['statName']} (Home)")
        stat_columns.add(f"{stat['statName']} (Away)")

csv_columns.extend(sorted(stat_columns))  # Sort for consistent order

# Extracting and organizing data
rows = []

for match in matches:
    match_result = match['matchResult']
    row = {
        'Date': match_result['date'],
        'Home Team': match_result['homeTeam'],
        'Away Team': match_result['awayTeam'],
        'Home Team Goals': match_result['homeTeamGoals'],
        'Away Team Goals': match_result['awayTeamGoals']
    }
    
    for stat_name in stat_columns:
        row[stat_name] = ''  # Initialize all stats with empty string
    
    for stat in match['matchStats']:
        row[f"{stat['statName']} (Home)"] = stat['homeStatValue']
        row[f"{stat['statName']} (Away)"] = stat['awayStatValue']
    
    rows.append(row)

# Writing to CSV
csv_file = 'trainingData/matches.csv'
with open(csv_file, 'w', newline='') as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=csv_columns)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
