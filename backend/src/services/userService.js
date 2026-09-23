class UserService {
  constructor() {
    this.users = [];
  }

  async findByTelegramId(telegramId) {
    return this.users.find((user) => user.telegramId === telegramId) || null;
  }

  async createUser(userData) {
    this.users.push(userData);
    return userData;
  }
}

export default new UserService();
