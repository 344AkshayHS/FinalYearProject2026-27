// Tests for place names. They need no database and no internet.
// Run from the backend folder:  npm test

const test = require('node:test');
const assert = require('node:assert');
const { currentState, normaliseDistrict, normaliseState } = require('../src/districts');

test('old state names become today\'s names', () => {
  assert.strictEqual(normaliseState('Orissa'), 'Odisha');
  assert.strictEqual(normaliseState('Uttaranchal'), 'Uttarakhand');
  assert.strictEqual(normaliseState('Pondicherry'), 'Puducherry');
});

test('Telangana districts, made in 2014 out of Andhra Pradesh, are Telangana', () => {
  assert.strictEqual(currentState('Andhra Pradesh', 'Hyderabad'), 'Telangana');
  assert.strictEqual(currentState('Andhra Pradesh', 'Warangal'), 'Telangana');
  assert.strictEqual(currentState('Andhra Pradesh', 'Guntur'), 'Andhra Pradesh');
  assert.strictEqual(currentState('Andhra Pradesh', 'Vishakhapatnam'), 'Andhra Pradesh');
});

test('Leh and Kargil, made a union territory in 2019, are Ladakh', () => {
  assert.strictEqual(currentState('Jammu and Kashmir', 'Ladakh (Leh)'), 'Ladakh');
  assert.strictEqual(currentState('Jammu and Kashmir', 'Kargil'), 'Ladakh');
  assert.strictEqual(currentState('Jammu and Kashmir', 'Srinagar'), 'Jammu and Kashmir');
});

test('Dadra and Nagar Haveli and Daman and Diu, joined in 2020, are one union territory', () => {
  const joined = 'Dadra and Nagar Haveli and Daman and Diu';
  assert.strictEqual(currentState('Dadra and Nagar Haveli', 'Dadra and Nagar Haveli'), joined);
  assert.strictEqual(currentState('Daman and Diu', 'Daman'), joined);
  assert.strictEqual(currentState('Andaman and Nicobar', 'Nicobar Islands'), 'Andaman and Nicobar Islands');
});

test('other states are left alone', () => {
  assert.strictEqual(currentState('Maharashtra', 'Mumbai'), 'Maharashtra');
  assert.strictEqual(currentState('Karnataka', 'MYSORE'), 'Karnataka');
});

test('places with no crop statistics are recognised from their GPS point', () => {
  const { isUntestedPlace } = require('../src/services/district');
  assert.strictEqual(isUntestedPlace(22.57, 88.36), true); // Kolkata
  assert.strictEqual(isUntestedPlace(23.73, 92.72), true); // Aizawl, Mizoram
  assert.strictEqual(isUntestedPlace(12.2958, 76.6394), false); // Mysuru: Karnataka has figures everywhere
  assert.strictEqual(isUntestedPlace(18.52, 73.8567), false); // Pune
});

test('the renamed and split Karnataka districts still find their crop data', () => {
  assert.strictEqual(normaliseDistrict('Bengaluru South'), 'RAMANAGARA'); // renamed 23 May 2025
  assert.strictEqual(normaliseDistrict('Vijayanagara'), 'BELLARY'); // made in 2021 out of Ballari
  assert.strictEqual(normaliseDistrict('Ballari'), 'BELLARY');
});

test('the state list uses today\'s states and every state has districts', () => {
  const { listDistricts, listStates } = require('../src/services/district');
  const states = listStates();
  for (const state of ['Karnataka', 'Kerala', 'Telangana', 'Ladakh', 'Odisha']) {
    assert.ok(states.includes(state), state + ' is missing');
  }
  assert.ok(!states.includes('Orissa'));
  assert.ok(states.every((state) => listDistricts(state).length > 0));
  assert.ok(listDistricts('Karnataka').includes('DAKSHIN KANNAD'));
  assert.ok(listDistricts('Telangana').includes('Warangal'));
  assert.deepStrictEqual(listDistricts('Nowhere'), []);
});

test('a picked district outside Karnataka gets a point that lies inside it', () => {
  const { districtMiddle, findInBoundaries, listDistricts, listStates } = require('../src/services/district');
  for (const state of listStates().filter((name) => name !== 'Karnataka')) {
    for (const district of listDistricts(state)) {
      const middle = districtMiddle(state, district);
      assert.ok(middle, `${district}, ${state} has no middle point`);
      // where two boundaries overlap the first one wins, so only check the state
      assert.strictEqual(findInBoundaries(middle.lat, middle.lng)?.state, state, `${district}, ${state}`);
    }
  }
  assert.strictEqual(districtMiddle('Karnataka', 'MYSORE'), null); // Karnataka is answered from its sample farms
});
