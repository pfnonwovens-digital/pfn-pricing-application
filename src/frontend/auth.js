/**
 * Frontend Authentication Helper
 * Handles login, logout, token management, and authenticated API calls
 */

const auth = {
  /**
   * Get stored authentication token
   */
  getToken() {
    return localStorage.getItem('authToken');
  },

  /**
   * Store authentication token
   */
  setToken(token) {
    localStorage.setItem('authToken', token);
  },

  /**
   * Clear authentication token
   */
  clearToken() {
    localStorage.removeItem('authToken');
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return this.getToken() !== null;
  },

  /**
   * Login with email and password
   */
  async login(email, password) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  },

  /**
   * Logout (clear local token)
   */
  async logout() {
    try {
      const token = this.getToken();
      if (token) {
        // Notify backend (optional)
        fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }).catch(() => {}); // Ignore errors
      }

      this.clearToken();
      window.location.href = 'login.html';
    } catch (error) {
      console.error('Logout error:', error);
      this.clearToken();
      window.location.href = 'login.html';
    }
  },

  /**
   * Get current user
   */
  async getCurrentUser() {
    try {
      const response = await this.apiCall('/api/users/me');
      if (!response.ok) throw new Error('Failed to get user');
      return await response.json();
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  },

  /**
   * Make authenticated API call
   * Automatically includes auth token in headers
   * Handles token expiration
   */
  async apiCall(url, options = {}) {
    const token = this.getToken();

    if (!token) {
      console.error('No auth token found');
      this.redirectToLogin();
      return null;
    }

    // Merge headers
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      // Token expired or invalid
      if (response.status === 401) {
        console.warn('Token expired, redirecting to login');
        this.redirectToLogin();
        return null;
      }

      // Permission denied
      if (response.status === 403) {
        console.error('Access denied');
        return response;
      }

      return response;
    } catch (error) {
      console.error('API call error:', error);
      throw error;
    }
  },

  /**
   * Check authentication and redirect if needed
   */
  checkAuth() {
    if (!this.isAuthenticated()) {
      this.redirectToLogin();
      return false;
    }
    return true;
  },

  /**
   * Redirect to login page
   */
  redirectToLogin() {
    this.clearToken();
    window.location.href = 'login.html';
  },

  /**
   * Get user initials for avatar
   */
  getInitials(name) {
    if (!name) return '?';
    return name.split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
};

/**
 * Initialize auth on page load
 * Redirect to login if not authenticated (except on login page)
 */
window.addEventListener('load', () => {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const loginPages = ['login.html', ''];

  if (!loginPages.includes(currentPage) && !auth.isAuthenticated()) {
    auth.redirectToLogin();
  }
});
