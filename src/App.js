import React, { useState } from 'react';
import SearchBar from './components/SearchBar';
import ProductCard from './components/ProductCard';
import './App.css';

function App() {
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // 가격 비교 API 호출 (실제 API로 대체 가능)
  const searchProducts = async (searchTerm) => {
    setIsLoading(true);
    setHasSearched(true);
    
    // 실제 API 호출 대신 모의 데이터 사용
    setTimeout(() => {
      const mockData = generateMockData(searchTerm);
      setSearchResults(mockData);
      setIsLoading(false);
    }, 2000);
  };

  // 모의 데이터 생성 (실제 API로 대체)
  const generateMockData = (searchTerm) => {
    const stores = ['쿠팡', '11번가', 'G마켓', '네이버', '티몬', '위메프'];
    const products = [];
    
    stores.forEach((store, index) => {
      const basePrice = 500000 + Math.floor(Math.random() * 500000);
      const discount = Math.random() > 0.5 ? Math.floor(Math.random() * 30) + 10 : 0;
      const price = discount > 0 ? basePrice * (1 - discount / 100) : basePrice;
      const shippingCost = Math.random() > 0.7 ? Math.floor(Math.random() * 5000) + 2000 : 0;
      
      products.push({
        id: index,
        name: `${searchTerm} ${store} 특가`,
        store: store,
        price: Math.floor(price),
        originalPrice: discount > 0 ? basePrice : null,
        discount: discount,
        shippingCost: shippingCost,
        rating: (Math.random() * 2 + 3).toFixed(1),
        reviewCount: Math.floor(Math.random() * 1000) + 100,
        image: `https://via.placeholder.com/300x200/667eea/ffffff?text=${encodeURIComponent(searchTerm)}`,
        url: `https://${store.toLowerCase()}.com/search?q=${encodeURIComponent(searchTerm)}`,
        features: ['무료배송', '빠른배송', '안전거래'].slice(0, Math.floor(Math.random() * 3) + 1)
      });
    });

    // 가격순으로 정렬
    return products.sort((a, b) => (a.price + a.shippingCost) - (b.price + b.shippingCost));
  };

  const getLowestPrice = () => {
    if (searchResults.length === 0) return null;
    return searchResults[0];
  };

  const lowestPrice = getLowestPrice();

  return (
    <div className="App">
      <SearchBar onSearch={searchProducts} isLoading={isLoading} />
      
      {isLoading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>전 세계 쇼핑몰에서 최저가를 찾고 있습니다...</p>
        </div>
      )}

      {hasSearched && !isLoading && searchResults.length > 0 && (
        <div className="results-container">
          <div className="results-header">
            <h2>검색 결과 ({searchResults.length}개)</h2>
            {lowestPrice && (
              <div className="lowest-price-summary">
                <span className="lowest-price-label">🏆 최저가:</span>
                <span className="lowest-price-store">{lowestPrice.store}</span>
                <span className="lowest-price-amount">
                  ₩{new Intl.NumberFormat('ko-KR').format(lowestPrice.price + lowestPrice.shippingCost)}
                </span>
              </div>
            )}
          </div>
          
          <div className="products-grid">
            {searchResults.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                isLowestPrice={index === 0}
              />
            ))}
          </div>
        </div>
      )}

      {hasSearched && !isLoading && searchResults.length === 0 && (
        <div className="no-results">
          <h3>검색 결과가 없습니다</h3>
          <p>다른 키워드로 검색해보세요.</p>
        </div>
      )}
    </div>
  );
}

export default App;
