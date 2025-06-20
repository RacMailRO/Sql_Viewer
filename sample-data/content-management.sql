-- Content Management System Database Schema
-- Demonstrates complex relationships, hierarchies, and many-to-many relationships

-- Users and Authentication
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    bio TEXT,
    website_url VARCHAR(255),
    timezone VARCHAR(50) DEFAULT 'UTC',
    language VARCHAR(5) DEFAULT 'en',
    is_active BOOLEAN DEFAULT true,
    email_verified_at TIMESTAMP NULL,
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- User Roles for RBAC
CREATE TABLE roles (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSON,
    is_system_role BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Many-to-many: Users can have multiple roles
CREATE TABLE user_roles (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    assigned_by BIGINT,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_user_role (user_id, role_id)
);

-- Content Categories with Hierarchy
CREATE TABLE categories (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    parent_id BIGINT NULL,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    meta_title VARCHAR(255),
    meta_description TEXT,
    sort_order INT DEFAULT 0,
    level TINYINT DEFAULT 0,
    path VARCHAR(1000), -- Materialized path for quick queries
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL,
    INDEX idx_parent_id (parent_id),
    INDEX idx_path (path(255)),
    INDEX idx_active_sort (is_active, sort_order)
);

-- Content Posts/Articles
CREATE TABLE posts (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    author_id BIGINT NOT NULL,
    category_id BIGINT,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    excerpt TEXT,
    content LONGTEXT,
    featured_image_url VARCHAR(500),
    status ENUM('draft', 'pending', 'published', 'archived') DEFAULT 'draft',
    post_type ENUM('post', 'page', 'article', 'tutorial') DEFAULT 'post',
    visibility ENUM('public', 'private', 'password', 'members') DEFAULT 'public',
    password_hash VARCHAR(255) NULL,
    view_count INT DEFAULT 0,
    like_count INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    reading_time INT, -- Estimated reading time in minutes
    seo_title VARCHAR(255),
    seo_description TEXT,
    seo_keywords TEXT,
    is_featured BOOLEAN DEFAULT false,
    is_sticky BOOLEAN DEFAULT false,
    allow_comments BOOLEAN DEFAULT true,
    published_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    INDEX idx_author_status (author_id, status),
    INDEX idx_category_published (category_id, published_at),
    INDEX idx_status_published (status, published_at),
    FULLTEXT idx_content_search (title, excerpt, content)
);

-- Tags for flexible content categorization
CREATE TABLE tags (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    color VARCHAR(7), -- Hex color code
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Many-to-many: Posts can have multiple tags
CREATE TABLE post_tags (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    post_id BIGINT NOT NULL,
    tag_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE KEY unique_post_tag (post_id, tag_id)
);

-- Comments with nested threading
CREATE TABLE comments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    post_id BIGINT NOT NULL,
    parent_id BIGINT NULL, -- For threaded comments
    author_id BIGINT NULL, -- NULL for guest comments
    author_name VARCHAR(100),
    author_email VARCHAR(255),
    author_url VARCHAR(255),
    author_ip VARCHAR(45),
    content TEXT NOT NULL,
    status ENUM('pending', 'approved', 'spam', 'trash') DEFAULT 'pending',
    like_count INT DEFAULT 0,
    reply_count INT DEFAULT 0,
    level TINYINT DEFAULT 0, -- Comment nesting level
    path VARCHAR(1000), -- Materialized path for threading
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_post_status (post_id, status),
    INDEX idx_parent_level (parent_id, level),
    INDEX idx_path (path(255))
);

-- Media/File Management
CREATE TABLE media (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    uploader_id BIGINT,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    file_url VARCHAR(1000) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INT NOT NULL, -- Size in bytes
    width INT NULL, -- For images
    height INT NULL, -- For images
    duration INT NULL, -- For videos/audio in seconds
    alt_text VARCHAR(255),
    caption TEXT,
    description TEXT,
    metadata JSON, -- EXIF data, etc.
    storage_driver ENUM('local', 's3', 'cloudinary') DEFAULT 'local',
    is_public BOOLEAN DEFAULT true,
    download_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_uploader_type (uploader_id, mime_type),
    INDEX idx_filename (filename),
    FULLTEXT idx_search (original_filename, alt_text, caption, description)
);

-- Many-to-many: Posts can have multiple media attachments
CREATE TABLE post_media (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    post_id BIGINT NOT NULL,
    media_id BIGINT NOT NULL,
    sort_order INT DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
    UNIQUE KEY unique_post_media (post_id, media_id)
);

-- User Subscriptions/Followers
CREATE TABLE user_follows (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    follower_id BIGINT NOT NULL,
    following_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_follow (follower_id, following_id),
    CHECK (follower_id != following_id)
);

-- Content Likes/Reactions
CREATE TABLE post_likes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    post_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    reaction_type ENUM('like', 'love', 'laugh', 'wow', 'sad', 'angry') DEFAULT 'like',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_post_user_like (post_id, user_id)
);

-- Content Bookmarks/Saved Posts
CREATE TABLE bookmarks (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    post_id BIGINT NOT NULL,
    collection_name VARCHAR(100) DEFAULT 'default',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_post_bookmark (user_id, post_id),
    INDEX idx_user_collection (user_id, collection_name)
);

-- Site Settings/Configuration
CREATE TABLE settings (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    key_name VARCHAR(100) UNIQUE NOT NULL,
    value LONGTEXT,
    description TEXT,
    type ENUM('string', 'number', 'boolean', 'json', 'text') DEFAULT 'string',
    is_public BOOLEAN DEFAULT false, -- Can be accessed by frontend
    group_name VARCHAR(50) DEFAULT 'general',
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_group_sort (group_name, sort_order),
    INDEX idx_public (is_public)
);

-- Example data insertion
INSERT INTO roles (name, display_name, description, is_system_role) VALUES
('admin', 'Administrator', 'Full system access', true),
('editor', 'Editor', 'Can create and edit content', true),
('author', 'Author', 'Can create own content', true),
('subscriber', 'Subscriber', 'Can read and comment', true);

INSERT INTO users (username, email, password_hash, first_name, last_name, bio) VALUES
('admin', 'admin@example.com', '$2y$10$hash1', 'Admin', 'User', 'System administrator'),
('john_doe', 'john@example.com', '$2y$10$hash2', 'John', 'Doe', 'Content creator and tech enthusiast'),
('jane_smith', 'jane@example.com', '$2y$10$hash3', 'Jane', 'Smith', 'Professional writer and blogger'),
('bob_wilson', 'bob@example.com', '$2y$10$hash4', 'Bob', 'Wilson', 'Photography and travel blogger'),
('alice_brown', 'alice@example.com', '$2y$10$hash5', 'Alice', 'Brown', 'Tech reviewer and tutorials');

INSERT INTO categories (name, slug, description, level, path) VALUES
('Technology', 'technology', 'All things tech related', 0, '/technology'),
('Programming', 'programming', 'Programming tutorials and tips', 1, '/technology/programming'),
('Web Development', 'web-development', 'Frontend and backend development', 2, '/technology/programming/web-development'),
('Mobile Development', 'mobile-development', 'iOS and Android development', 2, '/technology/programming/mobile-development'),
('Lifestyle', 'lifestyle', 'Lifestyle and personal content', 0, '/lifestyle'),
('Travel', 'travel', 'Travel guides and experiences', 1, '/lifestyle/travel'),
('Photography', 'photography', 'Photography tips and showcases', 1, '/lifestyle/photography');

INSERT INTO tags (name, slug, description, color) VALUES
('JavaScript', 'javascript', 'JavaScript programming language', '#f7df1e'),
('Python', 'python', 'Python programming language', '#3776ab'),
('React', 'react', 'React.js framework', '#61dafb'),
('Vue.js', 'vuejs', 'Vue.js framework', '#4fc08d'),
('Tutorial', 'tutorial', 'Step-by-step tutorials', '#28a745'),
('Beginner', 'beginner', 'Beginner-friendly content', '#17a2b8'),
('Advanced', 'advanced', 'Advanced level content', '#dc3545'),
('Tips', 'tips', 'Quick tips and tricks', '#ffc107');