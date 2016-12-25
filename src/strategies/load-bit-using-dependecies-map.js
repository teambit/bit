module.exports = (consumer, boxName, bitName) => {
  const dependenciesMap = consumer.getDependenciesMap();
  console.log(dependenciesMap);
  return () => 'ba';
};
