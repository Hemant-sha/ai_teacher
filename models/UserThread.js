export default (sequelize, DataTypes) => {
    const UserThread = sequelize.define("UserThread", {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: 'Unique identifier for the user'
      },
      thread_id: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'OpenAI thread ID associated with this user'
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: 'Timestamp when the user thread was created'
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        onUpdate: DataTypes.NOW,
        comment: 'Timestamp when the user thread was last updated'
      }
    });
    return UserThread;
  };