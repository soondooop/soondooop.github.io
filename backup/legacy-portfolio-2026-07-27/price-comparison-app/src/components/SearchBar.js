import React, { useState } from 'react';
import { FaSearch, FaShoppingCart } from 'react-icons/fa';
import './SearchBar.css';

const SearchBar = ({ onSearch, isLoading }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      onSearch(searchTerm.trim());
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  return (
    <div className="search-container">
      <div className="search-header">
        <h1>🛒 최저가 비교</h1>
        <p>전 세계 쇼핑몰의 가격을 한 번에 비교해보세요!</p>
      </div>
      
      <form className="search-form" onSubmit={handleSubmit}>
        <div className="search-input-group">
          <FaSearch className="search-icon" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="찾고 싶은 상품을 검색해보세요 (예: iPhone 15, 삼성 갤럭시, 노트북...)"
            className="search-input"
            disabled={isLoading}
          />
          <button 
            type="submit" 
            className="search-button"
            disabled={isLoading || !searchTerm.trim()}
          >
            {isLoading ? (
              <div className="loading-spinner"></div>
            ) : (
              <>
                <FaShoppingCart />
                검색
              </>
            )}
          </button>
        </div>
      </form>

      <div className="search-suggestions">
        <h3>인기 검색어</h3>
        <div className="suggestion-tags">
          {['iPhone 15', '삼성 갤럭시 S24', 'MacBook Pro', 'PlayStation 5', 'Nike 운동화', '아디다스'].map((suggestion) => (
            <button
              key={suggestion}
              className="suggestion-tag"
              onClick={() => {
                setSearchTerm(suggestion);
                onSearch(suggestion);
              }}
              disabled={isLoading}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchBar;
