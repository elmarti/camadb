require('reflect-metadata');
const { Cama } = require('../dist');
const fs = require('fs');
async function demo() {
  fs.rmdirSync('./.cama', {
    recursive: true
  });
  console.info('creating database');
  console.time('Database created');
  const database = new Cama({
    path: './.cama',
    pageLength: 10000,
    persistenceAdapter: 'fs',
  });
  console.timeEnd('Database created');
  console.log('initializing collection');
  console.time('collection initialized');
  const collection = await database.initCollection('test', {
    columns: [],
    indexes: [],
  });
  console.timeEnd('collection initialized');
  console.log('generating dummy data');
  console.time('dummy data generated');
  const dummyData = [];
  for (let i = 0, ii = 100000; i < ii; i++) {
    dummyData.push({
      _id: i,
      name: 'Dummy field',
      description: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam fermentum dolor enim. Nullam mattis dolor faucibus mauris accumsan ultrices. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Aliquam erat volutpat. Nullam accumsan nisl ut nulla semper luctus. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Curabitur justo lorem, laoreet nec convallis ac, varius non nisl. Phasellus iaculis consequat tellus, id venenatis diam euismod efficitur. Nulla ac tellus vitae augue pharetra convallis. Proin volutpat quam elit, id tristique neque interdum id. Aliquam enim magna, pretium ac purus et, hendrerit semper nunc.

Aenean accumsan pretium odio, id euismod metus dapibus a. Morbi laoreet nibh a dui accumsan sollicitudin. Mauris mollis scelerisque felis, ac dignissim est bibendum id. Fusce ut leo leo. Cras ultricies turpis nec nisi imperdiet laoreet. Maecenas mattis risus id lectus interdum congue. Sed euismod venenatis ipsum, a porta mauris tincidunt et. Cras rutrum scelerisque molestie.

Suspendisse nec metus in est fringilla rhoncus. Maecenas nec arcu dignissim, blandit sapien eu, congue massa. Phasellus nec nibh sed nisi iaculis sollicitudin quis eu risus. Mauris a semper libero. Maecenas sodales a libero euismod lobortis. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Fusce a turpis mattis, tempus nunc vitae, mollis erat. Morbi mattis turpis eget luctus varius. Sed at ex nulla. Fusce feugiat dignissim sem sed eleifend. Fusce eget sem maximus justo tincidunt malesuada eu at magna.

Sed pellentesque ante quis nunc accumsan sodales. Nam vitae dui a quam bibendum tempor ut at est. Ut laoreet, turpis nec vestibulum pulvinar, ipsum magna fermentum sem, non pretium purus magna quis nisi. Vestibulum condimentum tortor vitae ex dictum, quis faucibus libero vulputate. Pellentesque viverra malesuada lorem nec sodales. Maecenas quis elementum neque, id elementum neque. Morbi molestie sapien non nisl faucibus dapibus.

`,
    });
  }
  console.timeEnd('dummy data generated');
  console.log(`Inserting 1 dummy row`);
  console.time('1 inserted');
  await collection.insertOne({
    _id: 'test',
    name: 'Dummy field',
    description: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam fermentum dolor enim. Nullam mattis dolor faucibus mauris accumsan ultrices. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Aliquam erat volutpat. Nullam accumsan nisl ut nulla semper luctus. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Curabitur justo lorem, laoreet nec convallis ac, varius non nisl. Phasellus iaculis consequat tellus, id venenatis diam euismod efficitur. Nulla ac tellus vitae augue pharetra convallis. Proin volutpat quam elit, id tristique neque interdum id. Aliquam enim magna, pretium ac purus et, hendrerit semper nunc.

Aenean accumsan pretium odio, id euismod metus dapibus a. Morbi laoreet nibh a dui accumsan sollicitudin. Mauris mollis scelerisque felis, ac dignissim est bibendum id. Fusce ut leo leo. Cras ultricies turpis nec nisi imperdiet laoreet. Maecenas mattis risus id lectus interdum congue. Sed euismod venenatis ipsum, a porta mauris tincidunt et. Cras rutrum scelerisque molestie.

Suspendisse nec metus in est fringilla rhoncus. Maecenas nec arcu dignissim, blandit sapien eu, congue massa. Phasellus nec nibh sed nisi iaculis sollicitudin quis eu risus. Mauris a semper libero. Maecenas sodales a libero euismod lobortis. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Fusce a turpis mattis, tempus nunc vitae, mollis erat. Morbi mattis turpis eget luctus varius. Sed at ex nulla. Fusce feugiat dignissim sem sed eleifend. Fusce eget sem maximus justo tincidunt malesuada eu at magna.

Sed pellentesque ante quis nunc accumsan sodales. Nam vitae dui a quam bibendum tempor ut at est. Ut laoreet, turpis nec vestibulum pulvinar, ipsum magna fermentum sem, non pretium purus magna quis nisi. Vestibulum condimentum tortor vitae ex dictum, quis faucibus libero vulputate. Pellentesque viverra malesuada lorem nec sodales. Maecenas quis elementum neque, id elementum neque. Morbi molestie sapien non nisl faucibus dapibus.

`,
  });
  console.timeEnd(`1 inserted`);
  console.log(`Inserting ${dummyData.length} rows`);
  console.time('insert complete');
  await collection.insertMany(dummyData);
  console.timeEnd('insert complete');
  console.time('uncached find');
  const findResult = await collection.findMany({
    _id: {
      $gte: 50000,
    },
  },
    {
      sort:{
        desc: x => x._id
      },
      offset: 100,
      limit: 100
    });
  console.log('result', findResult.length);
  console.timeEnd('uncached find');
  console.time('cached find');
  const cachedFindResult = await collection.findMany({
      _id: {
        $gte: 50000,
      },
    },
    {
      sort:{
        desc: x => x._id
      },

    });
  console.log('result', cachedFindResult.length);
  console.timeEnd('cached find');
}
console.time('demo');
demo()
  .then(() => console.timeEnd('demo'))
  .catch((err) => console.error(err));
