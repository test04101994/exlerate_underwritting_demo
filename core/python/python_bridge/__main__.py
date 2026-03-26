#!/usr/bin/env python3
"""
Python Bridge Main Module
Allows running python_bridge as a module with -m flag
"""
import sys
import os

# Add parent directory to path to access python_langgraph
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from python_bridge import main

if __name__ == "__main__":
    main()