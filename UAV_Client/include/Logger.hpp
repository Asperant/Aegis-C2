#ifndef LOGGER_HPP
#define LOGGER_HPP

#include <iostream>
#include <string>

class Logger {
public:
    static void info(const std::string& msg) { std::cout << "[INFO] " << msg << std::endl; }
    static void success(const std::string& msg) { std::cout << "[SUCCESS] " << msg << std::endl; }
    static void warn(const std::string& msg) { std::cout << "[WARN] " << msg << std::endl; }
    static void error(const std::string& msg) { std::cerr << "[ERROR] " << msg << std::endl; }
    static void critical(const std::string& msg) { std::cerr << "[CRITICAL] " << msg << std::endl; }
};

#endif // LOGGER_HPP
