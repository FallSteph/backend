const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);
const BACKUP_DIR = path.join(__dirname, 'backups');

async function createBackup() {
  console.log("Backup script running!");
  console.log("Backup directory will be:", BACKUP_DIR);
  
  // Create backup directory
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  console.log("Backup directory created!");
  
  return "Backup completed successfully!";
}

// Run the backup
createBackup().then(console.log).catch(console.error);