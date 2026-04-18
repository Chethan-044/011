/**
 * Map display category from client to Review schema enum.
 */
const categoryToEnum = (label) => {
  const key = (label || '').toLowerCase();
  const map = {
    electronics: 'electronics',
    'food & fmcg': 'food',
    food: 'food',
    clothing: 'clothing',
    beauty: 'beauty',
    home: 'home',
    books: 'books',
    sports: 'sports',
    other: 'other',
  };
  return map[key] || 'other';
};

const enumToDisplay = (e) => {
  const map = {
    electronics: 'Electronics',
    food: 'Food & FMCG',
    clothing: 'Clothing',
    beauty: 'Beauty',
    home: 'Home',
    books: 'Books',
    sports: 'Sports',
    other: 'Other',
  };
  return map[e] || e;
};

module.exports = { categoryToEnum, enumToDisplay };
