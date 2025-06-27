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
        comment: 'identifier for the user'
      },
      thread_id: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'OpenAI thread ID associated with this user'
      },
      title: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'OpenAI title associated with this user'
      }
    });
    return UserThread;
  };