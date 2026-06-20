import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import members from '../../data/milwaukee-council-members.json' with { type: 'json' };
import {
  alderpersonForDistrict,
  districtForNeighborhood,
  neighborhoodChoices,
  neighborhoodsForDistrict,
} from '../../geo/neighborhoods.js';

describe('geo/neighborhoods — neighborhood ↔ district ↔ alderperson', () => {
  it('districtForNeighborhood resolves the canonical name', () => {
    assert.equal(districtForNeighborhood('Riverwest'), 3);
    assert.equal(districtForNeighborhood('Bay View'), 14);
    assert.equal(districtForNeighborhood('Clarke Square'), 8);
  });

  it('normalizes case, diacritics, and punctuation', () => {
    assert.equal(districtForNeighborhood('riverwest'), 3);
    assert.equal(districtForNeighborhood('  BAY VIEW  '), 14);
    assert.equal(districtForNeighborhood("Brewer's Hill"), 6);
    assert.equal(districtForNeighborhood('brewers hill'), 6); // apostrophe-insensitive
  });

  it('returns null for an unknown neighborhood', () => {
    assert.equal(districtForNeighborhood('Gotham City'), null);
    assert.equal(districtForNeighborhood(''), null);
    assert.equal(districtForNeighborhood(undefined), null);
  });

  it('neighborhoodsForDistrict lists a district’s neighborhoods (number or string arg)', () => {
    assert.ok(neighborhoodsForDistrict(6).includes('Harambee'));
    assert.ok(neighborhoodsForDistrict('6').includes("Brewer's Hill")); // accepts a string district too
    assert.ok(neighborhoodsForDistrict(3).includes('Riverwest'));
    assert.deepEqual(neighborhoodsForDistrict(99), []);
  });

  it('alderpersonForDistrict joins the council directory (contact + headshot)', () => {
    const ald = alderpersonForDistrict(8);
    assert.match(ald.name, /Zamarripa/);
    assert.ok(ald.email, 'has email from the council file');
    assert.ok(ald.image_url, 'has headshot from the council file');
    assert.equal(alderpersonForDistrict(99), null);
  });

  it('neighborhoodChoices covers all 190 with their district', () => {
    const choices = neighborhoodChoices();
    assert.equal(choices.length, 190);
    const rw = choices.find((c) => c.name === 'Riverwest');
    assert.equal(rw.district, 3);
  });

  describe('completeness (the whole dataset resolves)', () => {
    it('every neighborhood resolves to a district', () => {
      for (const { name, district } of neighborhoodChoices()) {
        assert.equal(districtForNeighborhood(name), district, `unresolved: ${name}`);
      }
    });
    it('every district (1–15) has an alderperson in the council directory', () => {
      const districts = new Set(neighborhoodChoices().map((c) => c.district));
      assert.equal(districts.size, 15);
      for (const d of districts) {
        const ald = alderpersonForDistrict(d);
        assert.ok(ald?.name, `district ${d} has no alderperson`);
      }
    });
    it('the council file has exactly the 15 districts the map references', () => {
      const mapDistricts = new Set(neighborhoodChoices().map((c) => c.district));
      const councilDistricts = new Set(members.map((m) => m.district));
      assert.deepEqual(
        [...mapDistricts].sort((a, b) => a - b),
        [...councilDistricts].sort((a, b) => a - b),
      );
    });
  });
});
