#!/usr/bin/env python3
"""
Hello Skill — A sample reusable command-line tool.

This script greets a given name (default: 'World').
Designed as a template for adding new skills to the `skills/` directory.
"""

import argparse
import sys


def main():
    parser = argparse.ArgumentParser(description="Say hello to someone.")
    parser.add_argument("name", nargs="?", default="World", help="Name to greet (default: World)")
    args = parser.parse_args()

    print(f"Hello, {args.name}! 🌟")


if __name__ == "__main__":
    main()
