import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import Sequelize from "sequelize";

// Setup __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use fs to read the JSON file
const configFile = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/config.json'), 'utf-8'));

// Setup environment
const env = process.env.NODE_ENV || "development";
const config = configFile[env];

// Init Sequelize
let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

const db = {};

// Read all model files (except index.js)
const modelFiles = fs.readdirSync(__dirname).filter(
  (file) =>
    file.indexOf(".") !== 0 && file !== path.basename(__filename) && file.slice(-3) === ".js"
);

// Dynamically import models and initialize them
for (const file of modelFiles) {
  console.log("file names",file)
  const { default: defineModel } = await import(pathToFileURL(path.join(__dirname, file)).href);
  const model = defineModel(sequelize, Sequelize.DataTypes);
  db[model.name] = model;
}

// Run associations
Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// Add Sequelize references
db.sequelize = sequelize;
db.Sequelize = Sequelize;

export default db;
