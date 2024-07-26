import json
import csv

data = json.load(open('outputs/seasonsOutput.json'))

# Initialize CSV columns and rows
csv_columns = ['Club Name', 'Season ID', 'Matches Played', 'Matches Won', 'Matches Lost']
stat_columns = set()

# Extracting column names from JSON data
example_data = data[0]
for season in example_data['seasons']:
    stats = season['stats']
    
    for category in stats['generalStats']:
        for stat in category['stats']:
            stat_columns.add(stat['statName'])

csv_columns.extend(sorted(stat_columns))  # Sort for consistent order

rows = []

# Extracting and organizing data
for clubData in data:
    club_name = clubData['clubName']
    for season in clubData['seasons']:
        season_id = season['seasonID']
        stats = season['stats']
        
        row = {
            'Club Name': club_name,
            'Season ID': season_id,
            'Matches Played': stats['matchesPlayed'],
            'Matches Won': stats['matchesWon'],
            'Matches Lost': stats['matchesLost'],
        }
        
        for stat_name in stat_columns:
            row[stat_name] = '0'  # Initialize all stats with 0
        
        for category in stats['generalStats']:
            for stat in category['stats']:
                row[stat['statName']] = stat['statValue']
        
        rows.append(row)

# Writing to CSV
csv_file = 'trainingData/seasons.csv'
with open(csv_file, 'w', newline='') as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=csv_columns)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
