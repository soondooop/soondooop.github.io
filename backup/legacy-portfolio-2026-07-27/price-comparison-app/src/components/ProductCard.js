import React from 'react';
import { FaExternalLinkAlt, FaTruck, FaStar, FaHeart } from 'react-icons/fa';
import './ProductCard.css';

const ProductCard = ({ product, isLowestPrice }) => {
  const formatPrice = (price) => {
    return new Intl.NumberFormat('ko-KR').format(price);
  };

  const getStoreIcon = (storeName) => {
    const storeIcons = {
      '쿠팡': '🛒',
      '11번가': '🛍️',
      'G마켓': '🛒',
      '옥션': '🏪',
      '네이버': '🟢',
      '카카오': '🟡',
      '티몬': '🟠',
      '위메프': '🔵',
      'SSG': '🔴',
      '롯데온': '🔴',
      '신세계': '🔴',
      '하이마트': '🔵',
      '이마트': '🔵',
      '홈플러스': '🟠',
      '다나와': '🟢',
      '가격비교': '💰'
    };
    return storeIcons[storeName] || '🏪';
  };

  const getRatingStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <FaStar
          key={i}
          className={i <= rating ? 'star filled' : 'star empty'}
        />
      );
    }
    return stars;
  };

  return (
    <div className={`product-card ${isLowestPrice ? 'lowest-price' : ''}`}>
      {isLowestPrice && (
        <div className="lowest-price-badge">
          🏆 최저가
        </div>
      )}
      
      <div className="product-header">
        <div className="store-info">
          <span className="store-icon">{getStoreIcon(product.store)}</span>
          <span className="store-name">{product.store}</span>
          {product.rating && (
            <div className="rating">
              {getRatingStars(product.rating)}
              <span className="rating-text">({product.reviewCount})</span>
            </div>
          )}
        </div>
        <button className="wishlist-btn">
          <FaHeart />
        </button>
      </div>

      <div className="product-image">
        <img src={product.image} alt={product.name} />
      </div>

      <div className="product-info">
        <h3 className="product-name">{product.name}</h3>
        
        <div className="price-section">
          <div className="price-info">
            <span className="current-price">₩{formatPrice(product.price)}</span>
            {product.originalPrice && product.originalPrice > product.price && (
              <span className="original-price">₩{formatPrice(product.originalPrice)}</span>
            )}
          </div>
          
          {product.discount && (
            <div className="discount-badge">
              {product.discount}% 할인
            </div>
          )}
        </div>

        <div className="shipping-info">
          {product.shippingCost === 0 ? (
            <span className="free-shipping">
              <FaTruck /> 무료배송
            </span>
          ) : (
            <span className="shipping-cost">
              <FaTruck /> 배송비 ₩{formatPrice(product.shippingCost)}
            </span>
          )}
        </div>

        <div className="total-price">
          <strong>총 결제금액: ₩{formatPrice(product.price + product.shippingCost)}</strong>
        </div>

        <div className="product-features">
          {product.features && product.features.map((feature, index) => (
            <span key={index} className="feature-tag">{feature}</span>
          ))}
        </div>

        <div className="product-actions">
          <a 
            href={product.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="view-product-btn"
          >
            <FaExternalLinkAlt />
            상품 보기
          </a>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
