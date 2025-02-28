const pool = require('./db')

module.exports = {
    getUser(user_id, email_address, license_key, machine_id) {
        return new Promise((resolve, reject) => {
            pool.getConnection(function (error, tempCon) {
                if (error) {
                    console.log(error);
                    reject(error);
                } else {
                    // Build the SET clause dynamically
                    let condition;
                    let value

                    if (user_id !== null && user_id !== undefined) {
                        condition = "user_id = ?"
                        value = user_id
                    }
                    if (email_address !== null && email_address !== undefined) {
                        condition = "email_address = ?"
                        value = email_address
                    }

                    if (license_key !== null && license_key !== undefined) {
                      condition = "license_key = ?"
                      value = license_key
                   }


                   if (machine_id !== null && machine_id !== undefined) {
                    condition = "machine_id = ?"
                    value = machine_id
                 }
                    tempCon.query(
                        `SELECT * FROM users WHERE ${condition}`,
                        [value],
                        (error, result, fields) => {
                            pool.releaseConnection(tempCon);
                            // Error checking
                            if (error) {
                                console.log(error);
                                reject(error);
                            } else {
                                resolve(result.length > 0 ? result[0] : null);
                            }
                        }
                    );
                }
            });
        })
    },
    createUser(user_id, email_address, password, first_name, last_name) {
        return new Promise((resolve, reject) => {
            pool.getConnection(function (error, tempCon) {
                if (error) {
                    console.log(error)
                    reject(error)
                } else {
                    tempCon.query(
                        "INSERT INTO users (user_id, email_address, password, first_name, last_name) VALUES (?, ?, ?, ?, ?)",
                        [user_id, email_address, password, first_name, last_name],
                        (error) => {
                            pool.releaseConnection(tempCon);
                            // Error checking
                            if (error) {
                                console.log(error)
                                reject(error)
                            } else {
                                console.log('User saved')
                                resolve('User saved')
                            }
                        }
                    );
                }
            })
        })
    },
    updateUser(user_id, updates) {
        return new Promise((resolve, reject) => {
            pool.getConnection(function (error, tempCon) {
                if (error) {
                    console.log(error);
                    reject(error);
                    return;
                }
     
                // Build the SET clause dynamically
                const validUpdates = Object.entries(updates || {})
                    .filter(([key, value]) => {
                        return ['email_address', 'license_key', 'machine_id', 'activated_at'].includes(key) && 
                               value !== null && 
                               value !== undefined;
                    });
     
                if (validUpdates.length === 0) {
                    pool.releaseConnection(tempCon);
                    resolve('No updates provided');
                    return;
                }
     
                const setClause = validUpdates
                    .map(([key, _]) => `${key} = ?`)
                    .join(', ');
     
                // Get values for the SET clause
                const updateValues = validUpdates.map(([_, value]) => value);
     
                // Add user_id to values array
                updateValues.push(user_id);
     
                const query = `UPDATE users SET ${setClause} WHERE user_id = ?`;
     
                tempCon.query(
                    query,
                    updateValues,
                    (error, result) => {
                        pool.releaseConnection(tempCon);
                        
                        if (error) {
                            console.log(error);
                            reject(error);
                            return;
                        }
     
                        if (result.affectedRows === 0) {
                            resolve('No user found');
                            return;
                        }
     
                        resolve('User updated successfully');
                    }
                );
            });
        });
    } ,
    deleteUser(user_id) {
        return new Promise((resolve, reject) => {
            pool.getConnection(function (error, tempCon) {
                if (error) {
                    console.log(error);
                    reject(error);
                    return;
                }
    
                tempCon.query(
                    'DELETE FROM users WHERE user_id = ?',
                    [user_id],
                    (error, result) => {
                        pool.releaseConnection(tempCon);
                        
                        if (error) {
                            console.log(error);
                            reject(error);
                            return;
                        }
    
                        if (result.affectedRows === 0) {
                            resolve('No user found');
                            return;
                        }
    
                        resolve('User deleted successfully');
                    }
                );
            });
        });
    },
    updateSubscription(user_id, subscription_data) {
        return new Promise((resolve, reject) => {
          // Whitelist of valid columns - defines exactly what fields are allowed
          const VALID_COLUMNS = new Set([
            'status',
            'product_id',
            'original_transaction_id',
            'latest_transaction_id',
            'purchase_date',
            'expires_date',
            'auto_renew_status',
            'environment',
            'platform'
          ]);
      
          // Whitelist of valid status values
          const VALID_STATUSES = new Set([
            'active',
            'expired',
            'cancelled',
            'grace_period'
          ]);
      
          // Validate user_id
          if (!user_id || typeof user_id !== 'string') {
            return reject(new Error('Invalid user_id'));
          }
      
          // Validate subscription_data
          if (!subscription_data || typeof subscription_data !== 'object') {
            return reject(new Error('Invalid subscription data'));
          }
      
          // Validate status if provided
          if (subscription_data.status && !VALID_STATUSES.has(subscription_data.status)) {
            return reject(new Error('Invalid status value'));
          }
      
          // Filter and validate updates
          const validUpdates = Object.entries(subscription_data)
            .filter(([key, value]) => {
              return VALID_COLUMNS.has(key) && 
                     value !== null && 
                     value !== undefined;
            });
      
          pool.getConnection(function (error, tempCon) {
            if (error) {
              console.log(error);
              return reject(error);
            }
      
            // Use a transaction for data consistency
            tempCon.beginTransaction(async (err) => {
              if (err) {
                pool.releaseConnection(tempCon);
                return reject(err);
              }
      
              try {
                // Check if subscription exists using parameterized query
                const checkExisting = await new Promise((resolve, reject) => {
                  tempCon.query(
                    'SELECT id FROM subscriptions WHERE user_id = ? AND original_transaction_id = ?',
                    [user_id, subscription_data.original_transaction_id],
                    (error, results) => {
                      if (error) reject(error);
                      else resolve(results);
                    }
                  );
                });
      
                let result;
                if (checkExisting.length === 0) {
                  // INSERT new subscription
                  // Only use pre-validated column names from whitelist
                  const insertFields = ['user_id', ...validUpdates.map(([key]) => key)];
                  const insertValues = [user_id, ...validUpdates.map(([_, value]) => value)];
                  const placeholders = new Array(insertFields.length).fill('?').join(', ');
      
                  // Construct safe query using only whitelisted columns
                  const insertQuery = `
                    INSERT INTO subscriptions 
                    (${insertFields.map(field => `\`${field}\``).join(', ')}) 
                    VALUES (${placeholders})
                  `;
      
                  result = await new Promise((resolve, reject) => {
                    tempCon.query(insertQuery, insertValues, (error, results) => {
                      if (error) reject(error);
                      else resolve(results);
                    });
                  });
      
                } else {
                  // UPDATE existing subscription
                  if (validUpdates.length === 0) {
                    pool.releaseConnection(tempCon);
                    return resolve('No updates provided');
                  }
      
                  // Construct safe SET clause using only whitelisted columns
                  const setClause = validUpdates
                    .map(([key]) => `\`${key}\` = ?`)
                    .join(', ');
      
                  const updateValues = [
                    ...validUpdates.map(([_, value]) => value),
                    user_id,
                    subscription_data.original_transaction_id
                  ];
      
                  const updateQuery = `
                    UPDATE subscriptions 
                    SET ${setClause} 
                    WHERE user_id = ? AND original_transaction_id = ?
                  `;
      
                  result = await new Promise((resolve, reject) => {
                    tempCon.query(updateQuery, updateValues, (error, results) => {
                      if (error) reject(error);
                      else resolve(results);
                    });
                  });
                }
      
                // Commit transaction
                await new Promise((resolve, reject) => {
                  tempCon.commit((err) => {
                    if (err) reject(err);
                    else resolve();
                  });
                });
      
                pool.releaseConnection(tempCon);
                resolve({
                  success: true,
                  message: checkExisting.length === 0 ? 
                    'Subscription created successfully' : 
                    'Subscription updated successfully',
                  result
                });
      
              } catch (error) {
                // Rollback on error
                tempCon.rollback(() => {
                  pool.releaseConnection(tempCon);
                  reject(error);
                });
              }
            });
          });
        });
    },
    getSubscription(identifier, type = 'user_id') {
        return new Promise((resolve, reject) => {
            pool.getConnection(function (error, tempCon) {
                if (error) {
                    console.log(error);
                    reject(error);
                    return;
                }
    
                let condition;
                let value;
    
                // Only allow two specific types
                if (type === 'user_id' && identifier) {
                    condition = "s.user_id = ?";
                    value = identifier;
                } else if (type === 'original_transaction_id' && identifier) {
                    condition = "s.original_transaction_id = ?";
                    value = identifier;
                } else {
                    pool.releaseConnection(tempCon);
                    reject(new Error('Invalid identifier or type'));
                    return;
                }
    
                const query = `
                    SELECT 
                        s.*
                    FROM subscriptions s
                    LEFT JOIN users u ON s.user_id = u.user_id
                    WHERE ${condition}
                    ORDER BY s.expires_date DESC
                    LIMIT 1
                `;
    
                tempCon.query(
                    query,
                    [value],
                    (error, results) => {
                        pool.releaseConnection(tempCon);
                        if (error) {
                            console.log(error);
                            reject(error);
                            return;
                        }
                        
                        // Return null if no subscription found
                        if (results.length === 0) {
                            resolve(null);
                            return;
                        }
    
                        const subscription = results[0];
                        subscription.is_active = (
                            subscription.status === 'active' && 
                            new Date(subscription.expires_date) > new Date()
                        );
    
                        resolve(subscription);
                    }
                );
            });
        });
    },
    storeMessage(payload) {
      return new Promise((resolve, reject) => {
        pool.getConnection(function (error, tempCon) {
          if (error) {
            console.log(error);
            reject(error);
            return;
          }
    
          // Define allowed fields for user creation
          const allowedFields = ['user_id', 'message_id',  'conversation_id', 'message', 'sender'];
          
          // Filter valid fields from userData
          const validFields = Object.entries(payload || {})
            .filter(([key, value]) => {
              return allowedFields.includes(key) && 
                     value !== null && 
                     value !== undefined;
            });
    
          if (validFields.length === 0) {
            pool.releaseConnection(tempCon);
            reject(new Error('No valid user data provided'));
            return;
          }
    
          // Ensure required fields are present
          const requiredFields = ['user_id', 'message_id',  'conversation_id', 'message', 'sender'];
          const missingFields = requiredFields.filter(field => 
            !validFields.some(([key]) => key === field)
          );
    
          if (missingFields.length > 0) {
            pool.releaseConnection(tempCon);
            reject(new Error(`Missing required fields: ${missingFields.join(', ')}`));
            return;
          }
    
          // Construct query components
          const fields = validFields.map(([key]) => key).join(', ');
          const placeholders = validFields.map(() => '?').join(', ');
          const values = validFields.map(([_, value]) => value);
    
          // Build and execute the query
          const query = `INSERT INTO nova_ai_history (${fields}) VALUES (${placeholders})`;
          
          tempCon.query(query, values, (error) => {
            pool.releaseConnection(tempCon);
            
            if (error) {
              console.log(error);
              reject(error);
            } else {
              console.log('Message saved');
              resolve('Message saved');
            }
          });
        });
      });
    },
    getMessages(params) {
      return new Promise((resolve, reject) => {
        pool.getConnection(function (error, tempCon) {
          if (error) {
            console.log(error);
            reject(error);
            return;
          }
          
          const whereConditions = [];
          const values = [];
          
          // Handle required user_id parameter
          if (!params.user_id) {
            pool.releaseConnection(tempCon);
            reject(new Error('user_id is required'));
            return;
          }
          
          whereConditions.push('user_id = ?');
          values.push(params.user_id);
          
          // Optional: Filter by message_id
          if (params.message_id) {
            whereConditions.push('message_id = ?');
            values.push(params.message_id);
          }
          
          // Optional: Filter by conversation_id
          if (params.conversation_id) {
            whereConditions.push('conversation_id = ?');
            values.push(params.conversation_id);
          }
          
          // Construct the query
          const query = `
            SELECT * FROM nova_ai_history 
            WHERE ${whereConditions.join(' AND ')} 
            ORDER BY id DESC
          `;
          
          // Add limit if provided
          let finalQuery = query;
          if (params.limit && Number.isInteger(Number(params.limit))) {
            finalQuery += ' LIMIT ?';
            values.push(Number(params.limit));
          }
          
          // Execute query
          tempCon.query(finalQuery, values, (error, results) => {
            pool.releaseConnection(tempCon);
            if (error) {
              console.log(error);
              reject(error);
            } else {
              resolve(results);
            }
          });
        });
      });
    }
}