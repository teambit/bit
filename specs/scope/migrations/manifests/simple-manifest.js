/** @flow */

const addMigrationVersionKeyGenerator = (version) => {
  const addMigrationVersionKey = (model: Object): Object => {
    if (!model.migrationVersion) {
      model.migrationVersion = [version];
    } else {
      model.migrationVersion.push(version);
    }
    return model;
  };

  const addMigrationVersionKeyDeclartaion = {
    name: 'add Migration Version Key',
    migrate: addMigrationVersionKey
  };
  return addMigrationVersionKeyDeclartaion;
};

export default {
  '0.10.9': {
    Component: [addMigrationVersionKeyGenerator('0.10.9')],
    Version: [addMigrationVersionKeyGenerator('0.10.9'), addMigrationVersionKeyGenerator('0.10.9(2)')]
  },
  '0.10.10': {
    Component: [addMigrationVersionKeyGenerator('0.10.10'), addMigrationVersionKeyGenerator('0.10.10(2)')],
    Version: [addMigrationVersionKeyGenerator('0.10.10')]
  }
};
